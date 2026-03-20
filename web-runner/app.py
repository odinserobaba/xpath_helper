from __future__ import annotations

import base64
import json
import os
import re
import time
import uuid
import asyncio
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import anyio
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
OUTPUTS_DIR = BASE_DIR / "outputs"
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
SCENARIOS_DIR = REPO_ROOT / "tests" / "scenarios"
LOG_DIR = REPO_ROOT / "tests" / "logs"
RUNNER_TOKEN = os.environ.get("XPATH_RUNNER_TOKEN", "").strip() or None
SCENARIO_HISTORY_DIR = REPO_ROOT / "tests" / "scenarios" / ".history"

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
app = FastAPI(title="XPath Helper — Web Runner")

if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


ALLOWED_ACTIONS = {
    "start",
    "end",
    "click",
    "click_if_exists",
    "input",
    "set_date",
    "file_upload",
    "wait",
    "wait_for_element",
    "user_action",
    "assert",
    "branch",
    "navigate",
    "separator",
}


def _substitute_vars(s: str, variables: Dict[str, Any]) -> str:
    if not isinstance(s, str) or "{{" not in s:
        return s

    def repl(m: re.Match[str]) -> str:
        key = m.group(1).strip()
        v = variables.get(key)
        return "" if v is None else str(v)

    return re.sub(r"\{\{\s*([^}]+?)\s*\}\}", repl, s)

def _mask_secrets(obj: Any) -> Any:
    secret_keys = ("password", "passwd", "pwd", "token", "secret", "authorization", "auth")
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            ks = str(k).lower()
            if any(sk in ks for sk in secret_keys) and v not in (None, "", {} , []):
                out[k] = "***"
            else:
                out[k] = _mask_secrets(v)
        return out
    if isinstance(obj, list):
        return [_mask_secrets(x) for x in obj]
    return obj

def _merge_vars(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(base or {})
    for k, v in (overlay or {}).items():
        out[k] = v
    return out


def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def _jsonl_append(path: Path, obj: Dict[str, Any]) -> None:
    _ensure_dir(path.parent)
    line = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    with path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")

def _run_events_path(run_dir: Path) -> Path:
    return run_dir / "events.jsonl"

def _emit_run_event(run_dir: Path, obj: Dict[str, Any]) -> None:
    _jsonl_append(_run_events_path(run_dir), obj)


def _is_soft_assert_failure(err: str) -> bool:
    t = (err or "").lower()
    return "soft assert" in t or (t.startswith("soft ") and "assert" in t)


def _debug_wait_for_continue(run_dir: Path, step_no: int) -> None:
    """Пауза до POST /api/runs/{id}/debug-continue (создаётся файл _debug_continue в каталоге прогона)."""
    flag = run_dir / "_debug_continue"
    try:
        flag.unlink(missing_ok=True)
    except Exception:
        pass
    _emit_run_event(
        run_dir,
        {
            "ts": time.time(),
            "event": "debug_pause",
            "step": step_no,
            "runId": run_dir.name,
            "hint": "Отправьте POST /api/runs/{runId}/debug-continue или кнопку в UI",
        },
    )
    deadline = time.time() + 7200
    while time.time() < deadline:
        if flag.exists():
            try:
                flag.unlink(missing_ok=True)
            except Exception:
                pass
            _emit_run_event(run_dir, {"ts": time.time(), "event": "debug_resume", "step": step_no})
            return
        time.sleep(0.2)


def _require_token(request: Request) -> Optional[JSONResponse]:
    if not RUNNER_TOKEN:
        return None
    token = request.headers.get("x-runner-token") or ""
    if token != RUNNER_TOKEN:
        return JSONResponse({"ok": False, "error": "Unauthorized"}, status_code=401)
    return None


def _slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^a-z0-9._-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "scenario"


@dataclass
class Step:
    step: int
    xpath: str
    action: str
    params: Dict[str, Any]
    fallback_xpaths: List[str]
    title: str = ""
    tags: List[str] = field(default_factory=list)
    note: str = ""
    ticket: str = ""
    qa_status: str = ""  # draft | stable | flaky


def _step_sse_meta(s: Step) -> Dict[str, Any]:
    """Поля для Live run UI (как в Flow Editor)."""
    p = s.params or {}
    sc = p.get("stepColor")
    qs = (s.qa_status or "").strip().lower()
    if qs not in {"", "draft", "stable", "flaky"}:
        qs = ""
    return {
        "title": (s.title or "")[:180],
        "tags": list(s.tags)[:10],
        "stepColor": str(sc).strip()[:24] if sc else "",
        "note": (s.note or "")[:400],
        "ticket": (s.ticket or "")[:120],
        "qaStatus": qs,
    }


ACTIONS_NEEDING_XPATH = {
    "click",
    "click_if_exists",
    "input",
    "set_date",
    "file_upload",
    "wait_for_element",
}


def _validate_scenario_raw(raw: Any) -> Tuple[List[str], List[str]]:
    """Проверка сценария до сохранения: (ошибки, предупреждения). Ошибки блокируют сохранение API при желании."""
    errors: List[str] = []
    warnings: List[str] = []
    if not isinstance(raw, dict):
        return (["Сценарий должен быть объектом JSON"], warnings)
    steps_raw = raw.get("steps")
    if not isinstance(steps_raw, list):
        return (["Поле steps должно быть массивом"], warnings)

    seen_steps: Dict[int, int] = {}
    draft_or_flaky = 0
    for i, s in enumerate(steps_raw):
        if not isinstance(s, dict):
            continue
        action = s.get("action")
        if action not in ALLOWED_ACTIONS or action == "separator":
            continue
        try:
            sn = int(s.get("step") or 0)
        except Exception:
            sn = 0
        if sn > 0:
            seen_steps[sn] = seen_steps.get(sn, 0) + 1
        xpath = str(s.get("xpath") or "").strip()
        params = s.get("params") if isinstance(s.get("params"), dict) else {}
        qs = str(s.get("qaStatus") or s.get("qa_status") or "").strip().lower()
        if qs in {"draft", "flaky"}:
            draft_or_flaky += 1

        if action == "navigate":
            url = str((params or {}).get("url") or "").strip()
            if not url:
                errors.append(f"Шаг #{sn or i + 1} navigate: не задан params.url")
        elif action in ACTIONS_NEEDING_XPATH:
            if not xpath or xpath in {"—", "-"}:
                errors.append(f"Шаг #{sn or i + 1} ({action}): нужен непустой xpath")

        if action == "branch":
            p = params or {}
            has_yes = p.get("nextStep") not in (None, "", 0) or p.get("next") not in (None, "", 0) or p.get("nextId")
            has_no = p.get("nextElseStep") not in (None, "", 0) or p.get("nextElse") not in (None, "", 0) or p.get("nextElseId")
            if not has_yes and not has_no:
                warnings.append(
                    f"Шаг #{sn or i + 1} branch: нет целей nextStep/nextElseStep — проверьте связи на схеме",
                )

        if action in {"assert", "branch"}:
            cond = str((params or {}).get("condition") or "")
            if cond in {
                "element_exists",
                "attribute_equals",
                "text_equals",
                "text_contains",
                "count_equals",
            }:
                if not xpath or xpath in {"—", "-"}:
                    warnings.append(f"Шаг #{sn or i + 1} ({action}): для условия {cond!r} обычно нужен xpath")

    for num, cnt in seen_steps.items():
        if cnt > 1:
            errors.append(f"Дублируется номер шага step={num} ({cnt} раз)")

    if draft_or_flaky:
        warnings.append(f"В сценарии есть черновики/flaky шагов: {draft_or_flaky} — убедитесь перед релизным прогоном")

    return (errors, warnings)


def _xpath_for_sse(action: str, xpath: str) -> Optional[str]:
    if action == "navigate":
        return None
    x = (xpath or "").strip()
    if not x or x == "—":
        return None
    return x[:520]


def _step_done_timing(s: Step, step_t0: float) -> Dict[str, Any]:
    """duration + метаданные шага для SSE step_done."""
    return {
        "durationMs": int((time.time() - step_t0) * 1000),
        **_step_sse_meta(s),
    }


def _parse_scenario(raw: Any) -> Tuple[str, List[Step]]:
    if isinstance(raw, list):
        steps_raw = raw
        name = "scenario"
    else:
        name = str(raw.get("name") or "scenario")
        steps_raw = raw.get("steps") or []

    if not isinstance(steps_raw, list):
        raise ValueError("steps must be a list")

    steps: List[Step] = []
    for i, s in enumerate(steps_raw):
        if not isinstance(s, dict):
            continue
        action = s.get("action")
        if action not in ALLOWED_ACTIONS:
            continue
        if action == "separator":
            continue
        step_no = int(s.get("step") or (i + 1))
        xpath = s.get("xpath") or ""
        params = s.get("params") if isinstance(s.get("params"), dict) else {}
        fx = []
        if isinstance(params, dict) and isinstance(params.get("fallbackXPaths"), list):
            fx = [str(x) for x in params.get("fallbackXPaths") if str(x).strip()][:8]
        title_s = str(s.get("title") or "").strip()
        note_s = str(s.get("note") or "").strip()
        ticket_s = str(s.get("ticket") or "").strip()
        qa_s = str(s.get("qaStatus") or s.get("qa_status") or "").strip().lower()
        if qa_s not in {"", "draft", "stable", "flaky"}:
            qa_s = ""
        tag_list: List[str] = []
        if isinstance(s.get("tags"), list):
            tag_list = [str(t).strip() for t in s["tags"] if str(t).strip()][:12]
        steps.append(
            Step(
                step=step_no,
                xpath=str(xpath),
                action=str(action),
                params=params,
                fallback_xpaths=fx,
                title=title_s,
                tags=tag_list,
                note=note_s[:4000],
                ticket=ticket_s[:500],
                qa_status=qa_s,
            )
        )

    steps.sort(key=lambda x: x.step)
    # Точка входа start должна идти в списке до следующих шагов — иначе entry_idx указывает на последний элемент и цикл завершается после одного start.
    starts = [s for s in steps if s.action == "start"]
    ends = [s for s in steps if s.action == "end"]
    others = [s for s in steps if s.action not in {"start", "end"}]
    if starts or ends:
        steps = starts + others + ends
    return name, steps


def _resolve_branch_jump_index(target: Any, steps: List[Step]) -> Optional[int]:
    """Индекс шага в `steps` для перехода branch/assert. target: номер шага, числовая строка
    или id узла редактора вида ``step-12-…`` / ``step-12`` (из params.nextId / nextElseId)."""
    if target in (None, "", 0):
        return None
    if isinstance(target, bool) or isinstance(target, dict):
        return None
    step_no: Optional[int] = None
    try:
        if isinstance(target, (int, float)):
            step_no = int(target)
        elif isinstance(target, str):
            t = target.strip()
            if not t:
                return None
            if t.isdigit() or (t.startswith("-") and t[1:].isdigit()):
                step_no = int(t)
            else:
                step_no = None
                # Flow Editor: step-<ref>-<timestamp>…
                m_ref_ts = re.match(r"^step-(\d+)-(\d+)", t, re.I)
                if m_ref_ts:
                    seg1, seg2 = int(m_ref_ts.group(1)), int(m_ref_ts.group(2))
                    if seg2 >= 1_000_000_000_000:
                        step_no = seg1
                    elif seg1 >= 1_000_000_000_000:
                        step_no = None
                    else:
                        step_no = seg1
                if step_no is None:
                    m = re.search(r"(?:^|[-_/])(?:step[-_]?|s)(\d+)", t, re.I)
                    if m:
                        cand = int(m.group(1))
                        if cand < 1_000_000_000_000:
                            step_no = cand
                if step_no is None:
                    try:
                        step_no = int(float(t))
                    except ValueError:
                        return None
        else:
            return None
    except (ValueError, TypeError, OverflowError):
        return None
    if step_no is None or step_no <= 0:
        return None
    if step_no >= 1_000_000_000_000:
        return None
    return next((j for j, st in enumerate(steps) if st.step == step_no), None)


def _scenario_steps_count(raw: Any) -> int:
    try:
        _, steps = _parse_scenario(raw)
        return len(steps)
    except Exception:
        return 0


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: Any) -> None:
    _ensure_dir(path.parent)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _scenario_path(scenario_id: str) -> Path:
    return SCENARIOS_DIR / f"{scenario_id}.json"

def _snapshot_scenario(scenario_id: str) -> None:
    p = _scenario_path(scenario_id)
    if not p.exists():
        return
    ts = time.strftime("%Y%m%d_%H%M%S")
    dst = SCENARIO_HISTORY_DIR / scenario_id / f"{ts}.json"
    _ensure_dir(dst.parent)
    dst.write_text(p.read_text(encoding="utf-8"), encoding="utf-8")


def _run_meta_path(run_dir: Path) -> Path:
    return run_dir / "meta.json"

def _write_html_report(run_dir: Path, report: Dict[str, Any]) -> None:
    shots_dir = run_dir / "screenshots"
    def link(p: Optional[str]) -> str:
        if not p:
            return ""
        name = p.split("/")[-1]
        return f'<a href="/runs/{run_dir.name}/screenshots/{name}">{p}</a>'

    def esc(s: Any) -> str:
        t = "" if s is None else str(s)
        return (
            t.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    rows_html = []
    for s in report.get("steps", []):
        status = "OK" if s.get("ok") else "FAIL"
        url_after = esc(_url_for_log(s.get("urlAfter") or "", 220))
        jump = s.get("jumpTo")
        br = s.get("branchResult")
        extra = ""
        if jump is not None:
            extra += f'<br><small>jump→#{jump}</small>'
        if br is not None:
            extra += f'<br><small>ветка: {"Да" if br else "Нет"}</small>'
        rows_html.append(
            "<tr>"
            f"<td>{s.get('step')}</td>"
            f"<td><code>{s.get('action')}</code></td>"
            f"<td>{status}</td>"
            f"<td>{s.get('durationMs','')}</td>"
            f"<td>{(s.get('failReason') or '')}</td>"
            f"<td>{(s.get('error') or '')}</td>"
            f'<td style="max-width:280px;word-break:break-all"><small>{url_after}</small>{extra}</td>'
            f"<td>{link(s.get('screenshot'))}</td>"
            f"<td>{link(s.get('before'))}</td>"
            f"<td>{link(s.get('after'))}</td>"
            "</tr>"
        )

    slow = report.get("summary", {}).get("topSlowSteps", [])
    slow_html = "".join([f"<li>#{x.get('step')} {x.get('action')} — {x.get('durationMs')}ms</li>" for x in slow])
    html = f"""<!doctype html>
<html><head><meta charset="utf-8">
<title>Run {run_dir.name}</title>
<style>
body{{font-family:sans-serif;background:#0f0f1a;color:#eee;padding:20px}}
a{{color:#00d4aa}}
table{{border-collapse:collapse;width:100%}}
th,td{{border:1px solid #2a2a4a;padding:8px;font-size:12px;vertical-align:top}}
th{{background:#16213e;color:#aaa}}
code{{color:#00d4aa}}
</style></head>
<body>
<h1>Run: {run_dir.name}</h1>
<p>Scenario: {report.get('scenario','')}</p>
<p>OK: {report.get('okCount','')} | FAIL: {report.get('failCount','')} | Total: {report.get('totalMs','')}ms</p>
<p><a href="/runs/{run_dir.name}/report">report.json</a> · <a href="/runs/{run_dir.name}/log">log.txt</a></p>
<h2>Top slow steps</h2><ul>{slow_html}</ul>
<h2>Steps</h2>
<table>
<thead><tr><th>#</th><th>Action</th><th>Status</th><th>ms</th><th>Reason</th><th>Error</th><th>URL после</th><th>Скрин шага</th><th>Before</th><th>After</th></tr></thead>
<tbody>{''.join(rows_html)}</tbody>
</table>
</body></html>"""
    (run_dir / "report.html").write_text(html, encoding="utf-8")


def _maybe_write_file_from_base64(run_dir: Path, file_name: str, b64: Optional[str]) -> Optional[Path]:
    if not b64 or not isinstance(b64, str):
        return None
    try:
        data = base64.b64decode(b64, validate=False)
    except Exception:
        return None
    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", file_name or "file")
    p = run_dir / "files" / safe_name
    _ensure_dir(p.parent)
    p.write_bytes(data)
    return p


def _log_line(lines: List[str], msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    lines.append(f"[{ts}] {msg}")


def _url_for_log(url: str, max_len: int = 180) -> str:
    u = (url or "").strip()
    if len(u) <= max_len:
        return u
    return u[: max_len - 1] + "…"


def _page_url_safe(page: Any) -> str:
    try:
        return str(page.url or "")
    except Exception:
        return ""


def run_scenario(
    scenario_name: str,
    steps: List[Step],
    *,
    variables: Optional[Dict[str, Any]] = None,
    start_url: str = "",
    default_timeout_ms: int = 15000,
    headless: bool = True,
    slow_mo_ms: int = 0,
    viewport: str = "1280x720",
    connect_over_cdp: bool = False,
    cdp_endpoint: str = "",
    bring_to_front: bool = True,
    highlight_steps: bool = True,
    highlight_ms: int = 600,
    run_dir: Path,
    start_step_no: Optional[int] = None,
    debug_breakpoints: Optional[Any] = None,
    capture_console: bool = False,
) -> Dict[str, Any]:
    logs: List[str] = []
    results: List[Dict[str, Any]] = []
    t0 = time.time()
    variables = dict(variables or {})

    width, height = 1280, 720
    try:
        w, h = viewport.lower().split("x", 1)
        width, height = int(w), int(h)
    except Exception:
        pass

    _log_line(logs, f"Scenario: {scenario_name}")
    _log_line(logs, f"Steps: {len(steps)}")
    _log_line(logs, f"Headless: {headless}, slowMoMs: {slow_mo_ms}, viewport: {width}x{height}")
    start_indices = [i for i, st in enumerate(steps) if st.action == "start"]
    if not start_indices:
        _log_line(
            logs,
            "⚠ Нет шага «Начало» (action=start): выполнение с первого шага в списке. "
            "Рекомендуется добавить один такой шаг в начало сценария (Flow Editor).",
        )
        entry_idx = 0
    else:
        entry_idx = start_indices[0]
        _log_line(
            logs,
            f"▶ Точка входа: шаг #{steps[entry_idx].step} (Начало). Всего шагов start в сценарии: {len(start_indices)}",
        )
        if len(start_indices) > 1:
            _log_line(
                logs,
                f"⚠ Несколько шагов «Начало» — используется первый (step={steps[entry_idx].step}).",
            )

    bp: set = set()
    if debug_breakpoints:
        if isinstance(debug_breakpoints, (list, tuple, set)):
            for x in debug_breakpoints:
                try:
                    bp.add(int(x))
                except (TypeError, ValueError):
                    pass

    if start_step_no is not None:
        try:
            target = int(start_step_no)
        except (TypeError, ValueError):
            target = None
        if target is not None:
            jump = next((i for i, st in enumerate(steps) if st.step == target), None)
            if jump is not None:
                entry_idx = jump
                _log_line(
                    logs,
                    f"▶ Запуск с шага #{target} (позиция в списке {jump}). Проверьте startUrl — страница должна соответствовать этому месту сценария.",
                )

    _emit_run_event(run_dir, {"ts": time.time(), "event": "run_start", "scenario": scenario_name, "stepsCount": len(steps)})

    _jsonl_append(
        LOG_DIR / "web-runner.log",
        {"ts": time.time(), "level": "info", "event": "playwright_launch", "runId": run_dir.name, "scenario": scenario_name},
    )
    with sync_playwright() as p:
        if connect_over_cdp:
            endpoint = (cdp_endpoint or "").strip()
            if endpoint.isdigit():
                endpoint = f"http://127.0.0.1:{endpoint}"
            if endpoint and "://" not in endpoint:
                endpoint = "http://" + endpoint
            if not endpoint:
                endpoint = "http://127.0.0.1:9222"
            _log_line(logs, f"CDP attach: {endpoint}")
            _emit_run_event(run_dir, {"ts": time.time(), "event": "cdp_attach", "endpoint": endpoint})
            browser = p.chromium.connect_over_cdp(endpoint)
            # Use existing context/profile when possible
            context = browser.contexts[0] if browser.contexts else browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()
        else:
            browser = p.chromium.launch(headless=headless, slow_mo=slow_mo_ms)
            context = browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()
        console_lines: List[str] = []
        if capture_console:

            def _on_console(msg: Any) -> None:
                try:
                    console_lines.append(f"{msg.type}: {msg.text}")
                except Exception:
                    pass

            page.on("console", _on_console)

        tracing_enabled = False

        def maybe_start_tracing(params: Dict[str, Any]) -> None:
            nonlocal tracing_enabled
            if tracing_enabled:
                return
            try:
                if bool(params.get("trace", False)) or bool(params.get("tracing", False)):
                    context.tracing.start(screenshots=True, snapshots=True, sources=True)
                    tracing_enabled = True
            except Exception:
                tracing_enabled = False

        def screenshot(name: str) -> Optional[str]:
            try:
                shots = run_dir / "screenshots"
                _ensure_dir(shots)
                path = shots / f"{name}.png"
                page.screenshot(path=str(path), full_page=True)
                return str(path.relative_to(run_dir))
            except Exception:
                return None

        def element_screenshot(locator, name: str) -> Optional[str]:
            try:
                shots = run_dir / "screenshots"
                _ensure_dir(shots)
                path = shots / f"{name}.png"
                locator.screenshot(path=str(path))
                return str(path.relative_to(run_dir))
            except Exception:
                return None

        def maybe_bring_to_front() -> None:
            if not bring_to_front:
                return
            try:
                page.bring_to_front()
            except Exception:
                return

        def highlight_locator(locator) -> None:
            if not highlight_steps:
                return
            ms = int(highlight_ms or 0)
            if ms <= 0:
                return
            try:
                locator.evaluate(
                    """(el, ms) => {
                      try {
                        const prevOutline = el.style.outline;
                        const prevShadow = el.style.boxShadow;
                        el.style.outline = '3px solid #00d4aa';
                        el.style.boxShadow = '0 0 18px rgba(0,212,170,0.35)';
                        setTimeout(() => { el.style.outline = prevOutline; el.style.boxShadow = prevShadow; }, Math.max(0, ms|0));
                      } catch (e) {}
                    }""",
                    ms,
                )
            except Exception:
                return

        def first_visible(locator):
            """Pick first visible element from a locator list (best-effort)."""
            try:
                idx = locator.evaluate_all(
                    """(els) => {
                      for (let i = 0; i < els.length; i++) {
                        const el = els[i];
                        if (!el) continue;
                        const cs = window.getComputedStyle(el);
                        if (!cs) continue;
                        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
                        const r = el.getBoundingClientRect();
                        if (r.width <= 0 || r.height <= 0) continue;
                        return i;
                      }
                      return -1;
                    }"""
                )
                if isinstance(idx, int) and idx >= 0:
                    return locator.nth(idx)
            except Exception:
                pass
            return locator.first

        def js_click_first_visible_by_xpath(xp: str) -> bool:
            """Click first visible element matched by XPath inside the page."""
            try:
                return bool(
                    page.evaluate(
                        """(xpath) => {
                          try {
                            const snap = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                            const isVisible = (el) => {
                              if (!el) return false;
                              const cs = window.getComputedStyle(el);
                              if (!cs) return false;
                              if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
                              const r = el.getBoundingClientRect();
                              return r.width > 0 && r.height > 0;
                            };
                            for (let i = 0; i < snap.snapshotLength; i++) {
                              const el = snap.snapshotItem(i);
                              if (!isVisible(el)) continue;
                              try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
                              try { el.click(); return true; } catch (e) {}
                            }
                            return false;
                          } catch (e) {
                            return false;
                          }
                        }""",
                        xp,
                    )
                )
            except Exception:
                return False

        def try_open_listbox_hint() -> None:
            """Best-effort: open combobox/listbox via keyboard to make options visible."""
            try:
                # 1) focus an existing combobox if present
                try:
                    cb = page.locator("input[role='combobox'][aria-expanded='false'], input[role='combobox']:not([aria-expanded]), input[role='combobox']").first
                    if cb.count() > 0:
                        try:
                            cb.scroll_into_view_if_needed(timeout=1500)
                        except Exception:
                            pass
                        try:
                            cb.click(timeout=1500, force=True)
                        except Exception:
                            try:
                                cb.focus()
                            except Exception:
                                pass
                except Exception:
                    pass
                # 2) try keyboard open patterns
                page.keyboard.press("ArrowDown")
                page.wait_for_timeout(180)
                page.keyboard.press("ArrowDown")
                page.wait_for_timeout(180)
            except Exception:
                return

        def element_visibility_summary_by_xpath(xp: str) -> Dict[str, Any]:
            """Return counts for total/visible matches for debugging/heuristics."""
            try:
                return page.evaluate(
                    """(xpath) => {
                      try {
                        const snap = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                        let visible = 0;
                        for (let i = 0; i < snap.snapshotLength; i++) {
                          const el = snap.snapshotItem(i);
                          if (!el) continue;
                          const cs = window.getComputedStyle(el);
                          if (!cs) continue;
                          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
                          const r = el.getBoundingClientRect();
                          if (r.width <= 0 || r.height <= 0) continue;
                          visible++;
                        }
                        return { total: snap.snapshotLength, visible };
                      } catch (e) { return { total: 0, visible: 0, error: String(e) }; }
                    }""",
                    xp,
                )
            except Exception as e:
                return {"total": 0, "visible": 0, "error": str(e)}

        try:
            if start_url:
                _log_line(logs, f"Start URL: {start_url}")
                page.goto(start_url, wait_until="domcontentloaded", timeout=30_000)
                _emit_run_event(run_dir, {"ts": time.time(), "event": "navigated", "url": start_url})
                maybe_bring_to_front()

            idx = entry_idx
            while idx < len(steps):
                s = steps[idx]
                if bp and s.step in bp:
                    _debug_wait_for_continue(run_dir, s.step)
                step_t0 = time.time()
                ok = True
                err = ""
                shot = None
                shot_before = None
                shot_after = None
                el_before = None
                el_after = None

                # Substitute variables in commonly used fields
                xpath = _substitute_vars(s.xpath, variables)
                params = {
                    k: (_substitute_vars(v, variables) if isinstance(v, str) else v)
                    for k, v in (s.params or {}).items()
                }
                maybe_start_tracing(params)
                step_timeout_ms = int(params.get("timeoutMs") or default_timeout_ms or 5000)
                wait_state = str(params.get("waitState") or "visible").strip().lower()
                if wait_state not in {"visible", "attached"}:
                    wait_state = "visible"
                require_enabled = bool(params.get("requireEnabled", True))
                # Click robustness knobs
                click_force = bool(params.get("clickForce", False))
                click_trial = bool(params.get("clickTrial", True))
                click_js_fallback = bool(params.get("clickJsFallback", True))
                prefer_visible = bool(params.get("preferVisible", True))
                retry_on_flaky = bool(params.get("retryOnFlaky", True))
                max_attempts = int(params.get("flakyMaxAttempts") or 2)
                retry_delay_ms = int(params.get("flakyRetryDelayMs") or 250)
                fallback_xpaths = [
                    _substitute_vars(x, variables) for x in (s.fallback_xpaths or [])
                    if isinstance(x, str) and x.strip()
                ]
                selector_candidates = [xpath] + fallback_xpaths
                selector_used = xpath

                if s.action == "navigate":
                    nav_u = _url_for_log(str(params.get("url") or ""), 200)
                    _log_line(logs, f"#{s.step} navigate → {nav_u!r}")
                elif s.action in {"start", "end"}:
                    _log_line(logs, f"#{s.step} {s.action}")
                else:
                    _log_line(logs, f"#{s.step} {s.action} xpath={xpath[:120]!r}")
                _emit_run_event(
                    run_dir,
                    {
                        "ts": time.time(),
                        "event": "step_start",
                        "step": s.step,
                        "action": s.action,
                        **_step_sse_meta(s),
                        "xpath": _xpath_for_sse(s.action, xpath),
                        "navigateUrl": str(params.get("url") or "").strip() if s.action == "navigate" else None,
                        "timeoutMs": step_timeout_ms,
                    },
                )
                _jsonl_append(
                    LOG_DIR / "web-runner.log",
                    {
                        "ts": time.time(),
                        "level": "info",
                        "event": "step_start",
                        "runId": run_dir.name,
                        "scenario": scenario_name,
                        "step": s.step,
                        "action": s.action,
                    },
                )

                try:
                    # Screenshot before step (best-effort)
                    shot_before = screenshot(f"step_{s.step}_before")
                    # Element screenshot before (best-effort)
                    try:
                        if xpath and s.action not in {"navigate", "wait", "user_action", "start", "end"}:
                            loc0 = page.locator(f"xpath={xpath}").first
                            if loc0.count() > 0:
                                el_before = element_screenshot(loc0, f"step_{s.step}_el_before")
                    except Exception:
                        el_before = None

                    def is_flaky_error(e: Exception) -> bool:
                        msg = str(e)
                        return any(
                            k in msg
                            for k in [
                                "Execution context was destroyed",
                                "Target closed",
                                "Navigation",
                                "has been closed",
                                "Element is not attached",
                                "most likely because of a navigation",
                            ]
                        )

                    def ensure_enabled(locator) -> None:
                        if not require_enabled:
                            return
                        # Best-effort: many elements support is_enabled
                        try:
                            if not locator.is_enabled():
                                locator.wait_for(state="visible", timeout=max(0, step_timeout_ms))
                        except Exception:
                            return

                    if s.action == "start":
                        note = str(params.get("message") or params.get("label") or "").strip()
                        if note:
                            _log_line(logs, f"Начало: {note}")
                        shot_after = screenshot(f"step_{s.step}_after")
                        _log_line(logs, f"↳ URL: {_url_for_log(_page_url_safe(page))}")

                    elif s.action == "end":
                        note = str(params.get("message") or params.get("label") or "").strip()
                        if note:
                            _log_line(logs, f"Конец: {note}")
                        shot_after = screenshot(f"step_{s.step}_after")
                        _log_line(logs, f"↳ URL: {_url_for_log(_page_url_safe(page))}")

                    elif s.action == "navigate":
                        url = str(params.get("url") or "").strip()
                        if not url:
                            raise ValueError("navigate.params.url is required")
                        page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                        shot_after = screenshot(f"step_{s.step}_after")
                        _log_line(logs, f"↳ Страница после перехода: {_url_for_log(_page_url_safe(page))}")
                        _emit_run_event(
                            run_dir,
                            {"ts": time.time(), "event": "navigated", "step": s.step, "requestedUrl": _url_for_log(url, 400), "currentUrl": _url_for_log(_page_url_safe(page))},
                        )

                    elif s.action == "wait":
                        delay_ms = int(params.get("delayMs") or 500)
                        _log_line(logs, f"↳ Пауза {delay_ms} ms")
                        page.wait_for_timeout(max(0, delay_ms))
                        shot_after = screenshot(f"step_{s.step}_after")

                    elif s.action == "wait_for_element":
                        if not xpath:
                            raise ValueError("wait_for_element requires xpath")
                        ok_found = False
                        for cand in selector_candidates:
                            if not cand:
                                continue
                            try:
                                page.locator(f"xpath={cand}").first.wait_for(state=wait_state, timeout=max(0, step_timeout_ms))
                                selector_used = cand
                                ok_found = True
                                break
                            except PlaywrightTimeoutError:
                                continue
                        if not ok_found:
                            raise PlaywrightTimeoutError(f"Timeout {step_timeout_ms}ms exceeded for any selector (primary + fallbacks)")
                        shot_after = screenshot(f"step_{s.step}_after")
                        try:
                            if selector_used:
                                loc1 = page.locator(f"xpath={selector_used}").first
                                if loc1.count() > 0:
                                    el_after = element_screenshot(loc1, f"step_{s.step}_el_after")
                        except Exception:
                            el_after = None

                    elif s.action == "click_if_exists":
                        if not xpath:
                            raise ValueError("click_if_exists requires xpath")
                        for cand in selector_candidates:
                            if not cand:
                                continue
                            loc_all = page.locator(f"xpath={cand}")
                            if loc_all.count() > 0:
                                selector_used = cand
                                # Prefer JS click on first visible match (handles virtualized lists / hidden clones)
                                if prefer_visible:
                                    if js_click_first_visible_by_xpath(cand):
                                        break
                                    vis = element_visibility_summary_by_xpath(cand)
                                    if int(vis.get("total") or 0) > 0 and int(vis.get("visible") or 0) == 0:
                                        # Options exist but hidden → try opening listbox and retry
                                        try_open_listbox_hint()
                                        if js_click_first_visible_by_xpath(cand):
                                            break
                                loc = first_visible(loc_all) if prefer_visible else loc_all.first
                                loc.wait_for(state="attached", timeout=max(0, step_timeout_ms))
                                ensure_enabled(loc)
                                maybe_bring_to_front()
                                highlight_locator(loc)
                                try:
                                    loc.click(timeout=max(0, step_timeout_ms), force=click_force)
                                except Exception:
                                    loc.click(timeout=max(0, step_timeout_ms), force=True)
                                break
                        shot_after = screenshot(f"step_{s.step}_after")
                        try:
                            if selector_used:
                                loc1 = page.locator(f"xpath={selector_used}").first
                                if loc1.count() > 0:
                                    el_after = element_screenshot(loc1, f"step_{s.step}_el_after")
                        except Exception:
                            el_after = None

                    elif s.action == "click":
                        if not xpath:
                            raise ValueError("click requires xpath")
                        last_click_err = None
                        clicked = False
                        attempts = max(1, max_attempts) if retry_on_flaky else 1
                        for attempt in range(attempts):
                            for cand in selector_candidates:
                                if not cand:
                                    continue
                                try:
                                    loc_all = page.locator(f"xpath={cand}")
                                    # Fast path: click first visible match via JS (best for virtualized menus/lists)
                                    if prefer_visible:
                                        if js_click_first_visible_by_xpath(cand):
                                            selector_used = cand
                                            clicked = True
                                            break
                                        vis = element_visibility_summary_by_xpath(cand)
                                        if int(vis.get("total") or 0) > 0 and int(vis.get("visible") or 0) == 0:
                                            # Found only hidden matches → likely listbox closed. Try open and retry.
                                            try_open_listbox_hint()
                                            if js_click_first_visible_by_xpath(cand):
                                                selector_used = cand
                                                clicked = True
                                                break
                                    loc = first_visible(loc_all) if prefer_visible else loc_all.first
                                    loc.wait_for(state="attached", timeout=max(0, step_timeout_ms))
                                    ensure_enabled(loc)
                                    selector_used = cand
                                    maybe_bring_to_front()
                                    highlight_locator(loc)
                                    # Scroll into view first (helps with hidden/overlapped elements)
                                    try:
                                        loc.scroll_into_view_if_needed(timeout=max(0, step_timeout_ms))
                                    except Exception:
                                        pass
                                    # Trial click to surface intercept issues early (optional)
                                    if click_trial:
                                        try:
                                            loc.click(timeout=max(0, step_timeout_ms), trial=True)
                                        except Exception:
                                            pass
                                    # Primary click
                                    try:
                                        loc.click(timeout=max(0, step_timeout_ms), force=click_force)
                                    except Exception as e:
                                        # Fallback 1: force click
                                        if not click_force:
                                            try:
                                                loc.click(timeout=max(0, step_timeout_ms), force=True)
                                            except Exception:
                                                raise e
                                        else:
                                            raise e
                                    # Fallback 2: JS click (last resort)
                                    if click_js_fallback:
                                        try:
                                            loc.evaluate("(el) => el && el.click && el.click()")
                                        except Exception:
                                            pass
                                    clicked = True
                                    break
                                except (PlaywrightTimeoutError, PlaywrightError) as e:
                                    last_click_err = e
                                    if retry_on_flaky and attempt < attempts - 1 and is_flaky_error(e):
                                        page.wait_for_timeout(max(0, retry_delay_ms))
                                        continue
                            if clicked:
                                break
                        if not clicked:
                            raise last_click_err or PlaywrightTimeoutError(f"Timeout {step_timeout_ms}ms exceeded for click")
                        shot_after = screenshot(f"step_{s.step}_after")
                        try:
                            if selector_used:
                                loc1 = page.locator(f"xpath={selector_used}").first
                                if loc1.count() > 0:
                                    el_after = element_screenshot(loc1, f"step_{s.step}_el_after")
                        except Exception:
                            el_after = None

                    elif s.action == "input":
                        if not xpath:
                            raise ValueError("input requires xpath")
                        value = params.get("value")
                        if value is None:
                            value = ""
                        last_fill_err = None
                        filled = False
                        attempts = max(1, max_attempts) if retry_on_flaky else 1
                        for attempt in range(attempts):
                            for cand in selector_candidates:
                                if not cand:
                                    continue
                                try:
                                    loc = page.locator(f"xpath={cand}").first
                                    loc.wait_for(state=wait_state, timeout=max(0, step_timeout_ms))
                                    ensure_enabled(loc)
                                    selector_used = cand
                                    maybe_bring_to_front()
                                    highlight_locator(loc)
                                    loc.fill(str(value), timeout=max(0, step_timeout_ms))
                                    filled = True
                                    break
                                except (PlaywrightTimeoutError, PlaywrightError) as e:
                                    last_fill_err = e
                                    if retry_on_flaky and attempt < attempts - 1 and is_flaky_error(e):
                                        page.wait_for_timeout(max(0, retry_delay_ms))
                                        continue
                            if filled:
                                break
                        if not filled:
                            raise last_fill_err or PlaywrightTimeoutError(f"Timeout {step_timeout_ms}ms exceeded for input")
                        shot_after = screenshot(f"step_{s.step}_after")
                        try:
                            if selector_used:
                                loc1 = page.locator(f"xpath={selector_used}").first
                                if loc1.count() > 0:
                                    el_after = element_screenshot(loc1, f"step_{s.step}_el_after")
                        except Exception:
                            el_after = None

                    elif s.action == "set_date":
                        if not xpath:
                            raise ValueError("set_date requires xpath")
                        value = params.get("value")
                        if value is None:
                            value = ""
                        # Expect ISO date (YYYY-MM-DD) for input[type=date]; we still set any string as best-effort.
                        last_set_err = None
                        done = False
                        attempts = max(1, max_attempts) if retry_on_flaky else 1
                        for attempt in range(attempts):
                            for cand in selector_candidates:
                                if not cand:
                                    continue
                                try:
                                    loc = page.locator(f"xpath={cand}").first
                                    loc.wait_for(state=wait_state, timeout=max(0, step_timeout_ms))
                                    ensure_enabled(loc)
                                    selector_used = cand
                                    maybe_bring_to_front()
                                    highlight_locator(loc)
                                    loc.evaluate(
                                        """(el, v) => {
                                          try { el.focus && el.focus(); } catch (e) {}
                                          el.value = v ?? '';
                                          el.dispatchEvent(new Event('input', { bubbles: true }));
                                          el.dispatchEvent(new Event('change', { bubbles: true }));
                                          try { el.blur && el.blur(); } catch (e) {}
                                        }""",
                                        str(value),
                                    )
                                    done = True
                                    break
                                except (PlaywrightTimeoutError, PlaywrightError) as e:
                                    last_set_err = e
                                    if retry_on_flaky and attempt < attempts - 1 and is_flaky_error(e):
                                        page.wait_for_timeout(max(0, retry_delay_ms))
                                        continue
                            if done:
                                break
                        if not done:
                            raise last_set_err or PlaywrightTimeoutError(f"Timeout {step_timeout_ms}ms exceeded for set_date")
                        shot_after = screenshot(f"step_{s.step}_after")
                        try:
                            if selector_used:
                                loc1 = page.locator(f"xpath={selector_used}").first
                                if loc1.count() > 0:
                                    el_after = element_screenshot(loc1, f"step_{s.step}_el_after")
                        except Exception:
                            el_after = None

                    elif s.action == "file_upload":
                        if not xpath:
                            raise ValueError("file_upload requires xpath")
                        file_name = str(params.get("fileName") or "file")
                        file_b64 = params.get("fileContentBase64")
                        file_path = _maybe_write_file_from_base64(run_dir, file_name, file_b64)
                        if file_path is None:
                            # fallback: create empty file just to satisfy set_input_files
                            file_path = run_dir / "files" / re.sub(r"[^a-zA-Z0-9._-]+", "_", file_name)
                            _ensure_dir(file_path.parent)
                            if not file_path.exists():
                                file_path.write_bytes(b"")
                        last_up_err = None
                        done = False
                        for cand in selector_candidates:
                            if not cand:
                                continue
                            try:
                                loc = page.locator(f"xpath={cand}").first
                                loc.wait_for(state="attached", timeout=max(0, step_timeout_ms))
                                selector_used = cand
                                maybe_bring_to_front()
                                highlight_locator(loc)
                                loc.set_input_files(str(file_path), timeout=max(0, max(step_timeout_ms, 10_000)))
                                done = True
                                break
                            except (PlaywrightTimeoutError, PlaywrightError) as e:
                                last_up_err = e
                        if not done:
                            raise last_up_err or PlaywrightTimeoutError(f"Timeout {step_timeout_ms}ms exceeded for file_upload")
                        shot_after = screenshot(f"step_{s.step}_after")

                    elif s.action == "user_action":
                        # In extension this is a manual pause. Here we just log and continue.
                        message = str(params.get("message") or "user_action")
                        _log_line(logs, f"User action (skipped): {message}")
                        shot_after = screenshot(f"step_{s.step}_after")

                    elif s.action in {"assert", "branch"}:
                        cond = str(params.get("condition") or "element_exists")
                        expected = str(params.get("expectedValue") or "").strip()
                        attr_name = str(params.get("attributeName") or "").strip()
                        timeout_ms = int(params.get("timeoutMs") or 5000)

                        def check_condition() -> bool:
                            if cond == "url_equals":
                                return page.url == expected
                            if cond == "url_contains":
                                return expected in page.url
                            if cond == "url_matches":
                                try:
                                    return re.search(expected, page.url) is not None
                                except re.error:
                                    return False
                            if cond == "count_equals":
                                if not xpath:
                                    return False
                                try:
                                    return page.locator(f"xpath={xpath}").count() == int(expected)
                                except Exception:
                                    return False

                            if not xpath:
                                return False
                            loc = page.locator(f"xpath={xpath}").first
                            if cond == "element_exists":
                                return loc.count() > 0
                            if loc.count() == 0:
                                return False
                            if cond == "attribute_equals":
                                if not attr_name:
                                    return False
                                v = loc.get_attribute(attr_name)
                                return (v or "") == expected
                            if cond in {"text_equals", "text_contains"}:
                                t = (loc.inner_text() or "").strip()
                                return t == expected if cond == "text_equals" else expected in t
                            return False

                        wait_mode = bool(params.get("waitMode") is True)
                        soft = bool(params.get("softAssert") is True)
                        condition_ok = False
                        if wait_mode:
                            deadline = time.time() + max(0, timeout_ms) / 1000.0
                            while time.time() < deadline:
                                if check_condition():
                                    condition_ok = True
                                    break
                                page.wait_for_timeout(200)
                        else:
                            condition_ok = check_condition()

                        if s.action == "assert":
                            if not condition_ok and not soft:
                                raise AssertionError(f"assert failed: {cond} expected={expected!r} url={page.url!r}")
                            if not condition_ok and soft:
                                ok = False
                                err = f"soft assert failed: {cond} expected={expected!r}"

                        if s.action == "branch":
                            next_step = params.get("nextStep") or params.get("next") or params.get("nextId")
                            else_step = params.get("nextElseStep") or params.get("nextElse") or params.get("nextElseId")
                            target = next_step if condition_ok else else_step
                            new_idx = _resolve_branch_jump_index(target, steps)
                            if new_idx is not None:
                                jumped = steps[new_idx].step
                                jumped_action = steps[new_idx].action
                                idx = new_idx
                                shot_after = screenshot(f"step_{s.step}_after")
                                url_after = _page_url_safe(page)
                                _log_line(
                                    logs,
                                    f"↳ Ветвление: условие={cond!r} → {'Да' if condition_ok else 'Нет'} "
                                    f"→ переход к шагу #{jumped} ({jumped_action}), цель в JSON: {target!r}",
                                )
                                _log_line(logs, f"↳ URL страницы: {_url_for_log(url_after)}")
                                primary = shot_after or shot_before
                                results.append(
                                    {
                                        "step": s.step,
                                        "action": s.action,
                                        "ok": ok,
                                        "durationMs": int((time.time() - step_t0) * 1000),
                                        "error": err or None,
                                        "screenshot": primary,
                                        "before": shot_before,
                                        "after": shot_after,
                                        "elBefore": el_before,
                                        "elAfter": el_after,
                                        "selectorUsed": selector_used,
                                        "urlAfter": url_after,
                                        "branchResult": condition_ok,
                                        "jumpTo": jumped,
                                        "branchTarget": str(target) if target not in (None, "", 0) else None,
                                    }
                                )
                                _emit_run_event(
                                    run_dir,
                                    {
                                        "ts": time.time(),
                                        "event": "step_done",
                                        "step": s.step,
                                        "action": s.action,
                                        **_step_done_timing(s, step_t0),
                                        "ok": True,
                                        "branchResult": condition_ok,
                                        "jumpTo": jumped,
                                        "selectorUsed": selector_used,
                                        "urlAfter": url_after,
                                        "screenshot": primary,
                                        "before": shot_before,
                                        "after": shot_after,
                                    },
                                )
                                continue
                            if target not in (None, "", 0):
                                _log_line(
                                    logs,
                                    f"⚠ branch step {s.step}: не удалось перейти к цели {target!r} "
                                    f"(ветка {'Да' if condition_ok else 'Нет'}) — проверьте nextStep/nextElseStep или id узла",
                                )
                            else:
                                _log_line(
                                    logs,
                                    f"↳ Ветвление: {'Да' if condition_ok else 'Нет'} — цель перехода не задана, дальше по порядку шагов",
                                )
                        shot_after = screenshot(f"step_{s.step}_after")

                    else:
                        raise ValueError(f"Unsupported action: {s.action}")

                except (PlaywrightTimeoutError, PlaywrightError, AssertionError, ValueError) as e:
                    ok = False
                    err = str(e)
                    shot = screenshot(f"step_{s.step}_fail")
                    _log_line(logs, f"✗ FAIL step {s.step}: {err}")
                    _log_line(logs, f"↳ URL при ошибке: {_url_for_log(_page_url_safe(page))}")
                    sel_stats = None
                    if xpath and s.action not in {"navigate", "wait", "user_action", "start", "end"}:
                        try:
                            sel_stats = element_visibility_summary_by_xpath(xpath)
                        except Exception:
                            sel_stats = None
                    _emit_run_event(
                        run_dir,
                        {
                            "ts": time.time(),
                            "event": "step_done",
                            "step": s.step,
                            "action": s.action,
                            **_step_done_timing(s, step_t0),
                            "ok": False,
                            "error": err,
                            "softFailure": _is_soft_assert_failure(err),
                            "selectorUsed": selector_used,
                            "selectorStats": sel_stats,
                            "screenshot": shot,
                            "before": shot_before,
                            "after": shot_after,
                            "elBefore": el_before,
                            "elAfter": el_after,
                            "urlAfter": _page_url_safe(page),
                        },
                    )
                    _jsonl_append(
                        LOG_DIR / "web-runner.log",
                        {
                            "ts": time.time(),
                            "level": "error",
                            "event": "step_error",
                            "runId": run_dir.name,
                            "scenario": scenario_name,
                            "step": s.step,
                            "action": s.action,
                            "error": err,
                            "urlAfter": _page_url_safe(page),
                        },
                    )
                else:
                    url_done = _url_for_log(_page_url_safe(page))
                    if ok:
                        if s.action == "navigate":
                            _log_line(logs, f"✓ OK step {s.step}")
                        else:
                            _log_line(logs, f"✓ OK step {s.step} · {url_done}")
                        if s.action not in {"start", "end", "wait", "user_action", "navigate"}:
                            su = (selector_used or xpath or "")[:100]
                            if su and su != "—":
                                _log_line(logs, f"↳ Селектор: {su!r}")
                    else:
                        _log_line(logs, f"⚠ step {s.step} (без исключения): {err or '—'} · {url_done}")
                    primary_shot = shot_after or shot
                    _emit_run_event(
                        run_dir,
                        {
                            "ts": time.time(),
                            "event": "step_done",
                            "step": s.step,
                            "action": s.action,
                            **_step_done_timing(s, step_t0),
                            "ok": ok,
                            "error": err or None,
                            "softFailure": (not ok) and _is_soft_assert_failure(err or ""),
                            "selectorUsed": selector_used,
                            "before": shot_before,
                            "after": shot_after,
                            "screenshot": primary_shot,
                            "urlAfter": _page_url_safe(page),
                            "elBefore": el_before,
                            "elAfter": el_after,
                        },
                    )
                    if ok:
                        _jsonl_append(
                            LOG_DIR / "web-runner.log",
                            {
                                "ts": time.time(),
                                "level": "info",
                                "event": "step_ok",
                                "runId": run_dir.name,
                                "scenario": scenario_name,
                                "step": s.step,
                                "action": s.action,
                                "urlAfter": _page_url_safe(page),
                            },
                        )
                    else:
                        _jsonl_append(
                            LOG_DIR / "web-runner.log",
                            {
                                "ts": time.time(),
                                "level": "warning",
                                "event": "step_warn",
                                "runId": run_dir.name,
                                "scenario": scenario_name,
                                "step": s.step,
                                "action": s.action,
                                "error": err,
                                "urlAfter": _page_url_safe(page),
                            },
                        )

                url_after_row = _page_url_safe(page)
                if ok and shot_after:
                    shot = shot_after
                elif not ok and shot is None and shot_after:
                    shot = shot_after
                results.append(
                    {
                        "step": s.step,
                        "action": s.action,
                        "ok": ok,
                        "durationMs": int((time.time() - step_t0) * 1000),
                        "error": err or None,
                        "softFailure": (not ok) and _is_soft_assert_failure(err or ""),
                        "screenshot": shot,
                        "before": shot_before,
                        "after": shot_after,
                        "elBefore": el_before,
                        "elAfter": el_after,
                        "selectorUsed": selector_used,
                        "urlAfter": url_after_row,
                    }
                )

                # stop on hard fail unless step says mandatory=false
                mandatory = bool(params.get("mandatory", True))
                if not ok and mandatory:
                    break

                if s.action == "end":
                    _log_line(logs, "■ Завершение по шагу «Конец» (end)")
                    break
                idx += 1

        finally:
            try:
                if tracing_enabled:
                    trace_path = run_dir / "trace.zip"
                    context.tracing.stop(path=str(trace_path))
            except Exception:
                pass
            if capture_console and console_lines:
                try:
                    txt = "\n".join(console_lines[-8000:])
                    (run_dir / "console.log").write_text(txt, encoding="utf-8")
                except Exception:
                    pass
            context.close()
            browser.close()

    total_ms = int((time.time() - t0) * 1000)
    ok_count = sum(1 for r in results if r["ok"])
    fail_count = sum(1 for r in results if not r["ok"])

    # Summary: top slow steps and likely failure cause
    slow = sorted(results, key=lambda r: (r.get("durationMs") or 0), reverse=True)[:5]
    for r in results:
        if not r.get("ok"):
            em = str(r.get("error") or "")
            if "Timeout" in em:
                r["failReason"] = "timeout"
            elif "selector" in em.lower() or "locator" in em.lower():
                r["failReason"] = "selector"
            else:
                r["failReason"] = "error"

    _emit_run_event(run_dir, {"ts": time.time(), "event": "run_done", "okCount": ok_count, "failCount": fail_count, "totalMs": total_ms})
    return {
        "scenario": scenario_name,
        "okCount": ok_count,
        "failCount": fail_count,
        "totalMs": total_ms,
        "steps": results,
        "log": logs,
        "summary": {
            "topSlowSteps": [{"step": x["step"], "action": x["action"], "durationMs": x.get("durationMs")} for x in slow],
        },
    }

@app.get("/api/scenarios", response_class=JSONResponse)
def api_list_scenarios(request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized

    _ensure_dir(SCENARIOS_DIR)
    items: List[Dict[str, Any]] = []
    for p in sorted(SCENARIOS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            raw = None
        name = ""
        exported_at = ""
        version = None
        smoke_flag = False
        labels_obj: Any = None
        if isinstance(raw, dict):
            name = str(raw.get("name") or "")
            exported_at = str(raw.get("exportedAt") or "")
            version = raw.get("version")
            smoke_flag = bool(raw.get("smoke") is True)
            labels_obj = raw.get("labels")
        items.append(
            {
                "id": p.stem,
                "file": p.name,
                "name": name or p.stem,
                "exportedAt": exported_at or None,
                "version": version,
                "stepsCount": _scenario_steps_count(raw),
                "mtime": int(p.stat().st_mtime),
                "smoke": smoke_flag,
                "labels": labels_obj if isinstance(labels_obj, dict) else None,
            }
        )
    return JSONResponse({"ok": True, "scenarios": items})

@app.get("/api/scenarios/{scenario_id}", response_class=JSONResponse)
def api_get_scenario(scenario_id: str, request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    p = _scenario_path(scenario_id)
    if not p.exists():
        return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)
    try:
        data = _read_json(p)
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"Invalid JSON: {e}"}, status_code=500)
    return JSONResponse({"ok": True, "scenario": data})


@app.post("/api/scenarios/{scenario_id}/runner-settings", response_class=JSONResponse)
async def api_save_runner_settings(scenario_id: str, request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    p = _scenario_path(scenario_id)
    if not p.exists():
        return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)
    body = await request.json()
    if not isinstance(body, dict):
        return JSONResponse({"ok": False, "error": "Invalid body"}, status_code=400)
    try:
        data = _read_json(p)
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"Invalid scenario JSON: {e}"}, status_code=500)
    if not isinstance(data, dict):
        return JSONResponse({"ok": False, "error": "Scenario must be an object"}, status_code=400)
    # Store defaults under runnerSettings
    _snapshot_scenario(scenario_id)
    data["runnerSettings"] = body
    _write_json(p, data)
    _jsonl_append(LOG_DIR / "web-runner.log", {"ts": time.time(), "level": "info", "event": "runner_settings_saved", "scenarioId": scenario_id})
    return JSONResponse({"ok": True})


@app.get("/api/scenarios/{scenario_id}/history", response_class=JSONResponse)
def api_scenario_history(scenario_id: str, request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    d = SCENARIO_HISTORY_DIR / scenario_id
    if not d.exists():
        return JSONResponse({"ok": True, "history": []})
    items = []
    for p in sorted(d.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        items.append({"file": p.name, "mtime": int(p.stat().st_mtime)})
    return JSONResponse({"ok": True, "history": items})


@app.post("/api/scenarios", response_class=JSONResponse)
async def api_save_scenario(request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized

    raw = await request.json()
    try:
        name, steps = _parse_scenario(raw)
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"Invalid scenario format: {e}"}, status_code=400)

    warns_out: List[str] = []
    if isinstance(raw, dict):
        errs, warns_out = _validate_scenario_raw(raw)
        if errs:
            return JSONResponse(
                {"ok": False, "error": "; ".join(errs[:12]), "validationErrors": errs, "validationWarnings": warns_out},
                status_code=400,
            )

    exported_at = ""
    if isinstance(raw, dict):
        exported_at = str(raw.get("exportedAt") or "")
    ts = time.strftime("%Y%m%d_%H%M%S")
    base = _slugify(name)
    scenario_id = f"{base}_{ts}"
    _ensure_dir(SCENARIOS_DIR)
    path = SCENARIOS_DIR / f"{scenario_id}.json"
    # avoid collisions
    if path.exists():
        scenario_id = f"{scenario_id}_{uuid.uuid4().hex[:6]}"
        path = SCENARIOS_DIR / f"{scenario_id}.json"

    # Persist scenario id inside the JSON to simplify linking and future exports.
    if isinstance(raw, dict) and not raw.get("id"):
        raw = {**raw, "id": scenario_id}
    path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    _snapshot_scenario(scenario_id)

    _jsonl_append(
        LOG_DIR / "web-runner.log",
        {
            "ts": time.time(),
            "level": "info",
            "event": "scenario_saved",
            "scenarioId": scenario_id,
            "name": name,
            "stepsCount": len(steps),
            "exportedAt": exported_at or None,
        },
    )
    return JSONResponse(
        {
            "ok": True,
            "scenario": {"id": scenario_id, "name": name, "stepsCount": len(steps)},
            "validationWarnings": warns_out,
        }
    )


@app.delete("/api/scenarios/{scenario_id}", response_class=JSONResponse)
def api_delete_scenario(scenario_id: str, request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    p = SCENARIOS_DIR / f"{scenario_id}.json"
    if not p.exists():
        return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)
    p.unlink()
    _jsonl_append(LOG_DIR / "web-runner.log", {"ts": time.time(), "level": "info", "event": "scenario_deleted", "scenarioId": scenario_id})
    return JSONResponse({"ok": True})


@app.put("/api/scenarios/{scenario_id}", response_class=JSONResponse)
async def api_update_scenario(scenario_id: str, request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    p = _scenario_path(scenario_id)
    if not p.exists():
        return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)

    raw = await request.json()
    try:
        name, steps = _parse_scenario(raw)
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"Invalid scenario format: {e}"}, status_code=400)

    if not isinstance(raw, dict):
        return JSONResponse({"ok": False, "error": "Scenario must be an object"}, status_code=400)

    errs, warns = _validate_scenario_raw(raw)
    if errs:
        return JSONResponse(
            {"ok": False, "error": "; ".join(errs[:12]), "validationErrors": errs, "validationWarnings": warns},
            status_code=400,
        )

    # Preserve stable id when editing existing scenario.
    payload = dict(raw)
    payload["id"] = scenario_id
    if not payload.get("name"):
        payload["name"] = name or scenario_id
    if "version" not in payload:
        payload["version"] = 1

    _snapshot_scenario(scenario_id)
    _write_json(p, payload)
    _jsonl_append(
        LOG_DIR / "web-runner.log",
        {
            "ts": time.time(),
            "level": "info",
            "event": "scenario_updated",
            "scenarioId": scenario_id,
            "name": str(payload.get("name") or scenario_id),
            "stepsCount": len(steps),
        },
    )
    return JSONResponse(
        {
            "ok": True,
            "scenario": {"id": scenario_id, "name": str(payload.get("name") or scenario_id), "stepsCount": len(steps)},
            "validationWarnings": warns,
        }
    )


@app.post("/api/scenarios/validate", response_class=JSONResponse)
async def api_validate_scenario_body(request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    raw = await request.json()
    errs, warns = _validate_scenario_raw(raw)
    return JSONResponse({"ok": len(errs) == 0, "errors": errs, "warnings": warns})


@app.get("/api/scenarios/{scenario_id}/history-file/{file_name:path}", response_class=JSONResponse)
def api_scenario_history_file(scenario_id: str, file_name: str, request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    if ".." in file_name or "/" in file_name or "\\" in file_name:
        return JSONResponse({"ok": False, "error": "Invalid file"}, status_code=400)
    p = SCENARIO_HISTORY_DIR / scenario_id / file_name
    if not p.exists() or not p.is_file():
        return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)
    try:
        data = _read_json(p)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return JSONResponse({"ok": True, "scenario": data, "file": file_name})


@app.post("/api/scenarios/{scenario_id}/restore-history", response_class=JSONResponse)
async def api_restore_scenario_history(scenario_id: str, request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    body = await request.json()
    file_name = str(body.get("file") or "").strip()
    if not file_name or ".." in file_name or "/" in file_name or "\\" in file_name:
        return JSONResponse({"ok": False, "error": "Invalid file"}, status_code=400)
    snap = SCENARIO_HISTORY_DIR / scenario_id / file_name
    if not snap.exists():
        return JSONResponse({"ok": False, "error": "Snapshot not found"}, status_code=404)
    main = _scenario_path(scenario_id)
    if not main.exists():
        return JSONResponse({"ok": False, "error": "Scenario not found"}, status_code=404)
    try:
        raw = _read_json(snap)
        _, steps = _parse_scenario(raw)
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"Invalid snapshot: {e}"}, status_code=400)
    _snapshot_scenario(scenario_id)
    main.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    _jsonl_append(
        LOG_DIR / "web-runner.log",
        {"ts": time.time(), "level": "info", "event": "scenario_restored", "scenarioId": scenario_id, "from": file_name},
    )
    return JSONResponse({"ok": True, "stepsCount": len(steps)})


@app.post("/api/runs", response_class=JSONResponse)
async def api_run_scenario(request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized

    body = await request.json()
    scenario_id = str(body.get("scenarioId") or "").strip()
    if not scenario_id:
        return JSONResponse({"ok": False, "error": "scenarioId is required"}, status_code=400)

    path = _scenario_path(scenario_id)
    if not path.exists():
        return JSONResponse({"ok": False, "error": "Scenario not found"}, status_code=404)

    raw_bytes = path.read_bytes()
    raw = json.loads(raw_bytes.decode("utf-8"))
    scenario_name, steps = _parse_scenario(raw)

    runner_defaults: Dict[str, Any] = {}
    if isinstance(raw, dict) and isinstance(raw.get("runnerSettings"), dict):
        runner_defaults = raw.get("runnerSettings") or {}

    variables: Dict[str, Any] = {}
    base_url = str(body.get("baseUrl") or runner_defaults.get("baseUrl") or "").strip()
    if base_url:
        variables["baseUrl"] = base_url
    extra_vars = body.get("variables") or runner_defaults.get("variables") or {}
    if isinstance(extra_vars, dict):
        variables.update(extra_vars)

    headless = bool(body.get("headless", runner_defaults.get("headless", True)))
    slow_mo_ms = int(body.get("slowMoMs") or runner_defaults.get("slowMoMs") or 0)
    viewport = str(body.get("viewport") or runner_defaults.get("viewport") or "1280x720")
    start_url = str(body.get("startUrl") or runner_defaults.get("startUrl") or "").strip()
    default_timeout_ms = int(body.get("defaultTimeoutMs") or runner_defaults.get("defaultTimeoutMs") or 15000)
    connect_over_cdp = bool(body.get("connectOverCdp", runner_defaults.get("connectOverCdp", False)))
    cdp_endpoint = str(body.get("cdpEndpoint") or runner_defaults.get("cdpEndpoint") or "").strip()
    bring_to_front = bool(body.get("bringToFront", runner_defaults.get("bringToFront", True)))
    highlight_steps = bool(body.get("highlightSteps", runner_defaults.get("highlightSteps", True)))

    # Data-driven rows: list[dict]
    data_rows = body.get("dataRows", None)
    if data_rows is None:
        data_rows = runner_defaults.get("dataRows", None)
    max_rows = int(body.get("maxRows") or runner_defaults.get("maxRows") or 0)
    stop_on_first_fail = bool(body.get("stopOnFirstFail", runner_defaults.get("stopOnFirstFail", True)))

    start_step_raw = body.get("startStep", runner_defaults.get("startStep"))
    start_step_no: Optional[int] = None
    if start_step_raw not in (None, "", False):
        try:
            start_step_no = int(start_step_raw)
        except (TypeError, ValueError):
            start_step_no = None

    environment = str(body.get("environment") or runner_defaults.get("environment") or "").strip()
    run_labels = body.get("labels") or runner_defaults.get("labels") or {}
    if not isinstance(run_labels, dict):
        run_labels = {}

    dbg_bp = body.get("debugBreakpoints", runner_defaults.get("debugBreakpoints"))
    capture_console = bool(body.get("captureConsole", runner_defaults.get("captureConsole", False)))

    run_id = uuid.uuid4().hex[:12]
    run_dir = OUTPUTS_DIR / run_id
    _ensure_dir(run_dir)
    (run_dir / "input.json").write_bytes(raw_bytes)
    # Initialize events file early so UI can attach immediately.
    _emit_run_event(
        run_dir,
        {
            "ts": time.time(),
            "event": "created",
            "runId": run_id,
            "scenarioId": scenario_id,
            "scenario": scenario_name,
            "environment": environment or None,
            "startStep": start_step_no,
            "labels": run_labels,
        },
    )
    _write_json(
        _run_meta_path(run_dir),
        {
            "runId": run_id,
            "scenarioId": scenario_id,
            "scenarioName": scenario_name,
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "startedAtTs": time.time(),
            "environment": environment or None,
            "labels": run_labels,
            "settings": {
                "startUrl": start_url,
                "baseUrl": base_url,
                "headless": headless,
                "slowMoMs": slow_mo_ms,
                "viewport": viewport,
                "defaultTimeoutMs": default_timeout_ms,
                "connectOverCdp": connect_over_cdp,
                "cdpEndpoint": cdp_endpoint,
                "bringToFront": bring_to_front,
                "highlightSteps": highlight_steps,
                "variables": extra_vars if isinstance(extra_vars, dict) else {},
                "dataRowsCount": len(data_rows) if isinstance(data_rows, list) else 0,
                "maxRows": max_rows,
                "stopOnFirstFail": stop_on_first_fail,
                "startStep": start_step_no,
                "environment": environment,
                "labels": run_labels,
                "debugBreakpoints": dbg_bp if isinstance(dbg_bp, list) else None,
                "captureConsole": capture_console,
            },
        },
    )

    _jsonl_append(
        LOG_DIR / "web-runner.log",
        {
            "ts": time.time(),
            "level": "info",
            "event": "run_start",
            "runId": run_id,
            "scenarioId": scenario_id,
            "scenario": scenario_name,
            "stepsCount": len(steps),
            "headless": headless,
            "slowMoMs": slow_mo_ms,
            "viewport": viewport,
        },
    )

    async def _job():
        try:
            if isinstance(data_rows, list) and data_rows:
                rows = [r for r in data_rows if isinstance(r, dict)]
                if max_rows and max_rows > 0:
                    rows = rows[:max_rows]
                _emit_run_event(run_dir, {"ts": time.time(), "event": "dd_start", "rows": len(rows)})
                row_reports = []
                total_ok = 0
                total_fail = 0
                dd_t0 = time.time()
                for i, row in enumerate(rows):
                    if stop_on_first_fail and total_fail > 0:
                        break
                    row_vars = _merge_vars(variables, row)
                    _emit_run_event(run_dir, {"ts": time.time(), "event": "dd_row_start", "rowIndex": i})
                    rep = await anyio.to_thread.run_sync(
                        partial(
                            run_scenario,
                            scenario_name,
                            steps,
                            variables=row_vars,
                            start_url=start_url,
                            default_timeout_ms=default_timeout_ms,
                            headless=headless,
                            slow_mo_ms=slow_mo_ms,
                            viewport=viewport,
                            connect_over_cdp=connect_over_cdp,
                            cdp_endpoint=cdp_endpoint,
                            bring_to_front=bring_to_front,
                            highlight_steps=highlight_steps,
                            run_dir=run_dir / "rows" / f"row_{i+1}",
                            start_step_no=start_step_no,
                            debug_breakpoints=dbg_bp,
                            capture_console=capture_console,
                        )
                    )
                    row_reports.append({"rowIndex": i, "okCount": rep.get("okCount"), "failCount": rep.get("failCount"), "totalMs": rep.get("totalMs")})
                    if rep.get("failCount", 0) > 0:
                        total_fail += 1
                    else:
                        total_ok += 1
                    _emit_run_event(run_dir, {"ts": time.time(), "event": "dd_row_done", "rowIndex": i, "ok": rep.get("failCount", 0) == 0})
                total_ms = int((time.time() - dd_t0) * 1000)
                report = {
                    "scenario": scenario_name,
                    "dataDriven": True,
                    "rowsTotal": len(rows),
                    "rowsOk": total_ok,
                    "rowsFail": total_fail,
                    "totalMs": total_ms,
                    "rowReports": row_reports,
                    "settings": _mask_secrets({"variables": variables}),
                }
            else:
                report = await anyio.to_thread.run_sync(
                    partial(
                        run_scenario,
                        scenario_name,
                        steps,
                        variables=variables,
                        start_url=start_url,
                        default_timeout_ms=default_timeout_ms,
                        headless=headless,
                        slow_mo_ms=slow_mo_ms,
                        viewport=viewport,
                        connect_over_cdp=connect_over_cdp,
                        cdp_endpoint=cdp_endpoint,
                        bring_to_front=bring_to_front,
                        highlight_steps=highlight_steps,
                        run_dir=run_dir,
                        start_step_no=start_step_no,
                        debug_breakpoints=dbg_bp,
                        capture_console=capture_console,
                    )
                )
        except Exception as e:
            report = {
                "scenario": scenario_name,
                "okCount": 0,
                "failCount": 0,
                "totalMs": 0,
                "steps": [],
                "log": [],
                "error": str(e),
            }
            _emit_run_event(run_dir, {"ts": time.time(), "event": "run_done", "okCount": 0, "failCount": 1, "totalMs": 0, "error": str(e)})

        (run_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        (run_dir / "log.txt").write_text("\n".join(report.get("log", [])), encoding="utf-8")
        if isinstance(report, dict) and report.get("steps"):
            _write_html_report(run_dir, report)

        _jsonl_append(
            LOG_DIR / "web-runner.log",
            {
                "ts": time.time(),
                "level": "info",
                "event": "run_done",
                "runId": run_id,
                "scenarioId": scenario_id,
                "okCount": report.get("okCount"),
                "failCount": report.get("failCount"),
                "totalMs": report.get("totalMs"),
            },
        )

    # Fire-and-forget: return runId immediately so UI can open live page instantly.
    asyncio.create_task(_job())
    return JSONResponse({"ok": True, "runId": run_id})


@app.get("/api/runs", response_class=JSONResponse)
def api_list_runs(request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    items: List[Dict[str, Any]] = []
    if OUTPUTS_DIR.exists():
        for d in sorted(OUTPUTS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not d.is_dir():
                continue
            meta_path = _run_meta_path(d)
            if not meta_path.exists():
                continue
            try:
                meta = _read_json(meta_path)
            except Exception:
                continue
            report_path = d / "report.json"
            ok = None
            fail = None
            total = None
            if report_path.exists():
                try:
                    rep = _read_json(report_path)
                    ok = rep.get("okCount")
                    fail = rep.get("failCount")
                    total = rep.get("totalMs")
                except Exception:
                    pass
            items.append(
                {
                    "runId": meta.get("runId") or d.name,
                    "scenarioId": meta.get("scenarioId"),
                    "scenarioName": meta.get("scenarioName"),
                    "startedAt": meta.get("startedAt"),
                    "startedAtTs": meta.get("startedAtTs") or d.stat().st_mtime,
                    "okCount": ok,
                    "failCount": fail,
                    "totalMs": total,
                }
            )
    return JSONResponse({"ok": True, "runs": items})


@app.get("/api/scenarios/{scenario_id}/insights", response_class=JSONResponse)
def api_scenario_insights(scenario_id: str, request: Request) -> JSONResponse:
    """Агрегат по последним прогонам: успех, шаги с частыми падениями (эвристика «flaky»)."""
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    recent: List[Dict[str, Any]] = []
    step_fail_counts: Dict[Any, int] = {}
    if OUTPUTS_DIR.exists():
        for d in sorted(OUTPUTS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not d.is_dir():
                continue
            try:
                meta = _read_json(_run_meta_path(d))
            except Exception:
                continue
            if meta.get("scenarioId") != scenario_id:
                continue
            rep_path = d / "report.json"
            if not rep_path.exists():
                continue
            try:
                rep = _read_json(rep_path)
            except Exception:
                continue
            fail = int(rep.get("failCount") or 0)
            ok = fail == 0
            recent.append(
                {
                    "runId": meta.get("runId") or d.name,
                    "startedAtTs": meta.get("startedAtTs"),
                    "ok": ok,
                    "okCount": rep.get("okCount"),
                    "failCount": rep.get("failCount"),
                    "totalMs": rep.get("totalMs"),
                }
            )
            for st in rep.get("steps") or []:
                if not isinstance(st, dict) or st.get("ok"):
                    continue
                sn = st.get("step")
                step_fail_counts[sn] = step_fail_counts.get(sn, 0) + 1
            if len(recent) >= 40:
                break
    window = recent[:20]
    ok_n = sum(1 for r in window if r.get("ok"))
    rate = round(ok_n / len(window), 3) if window else None
    flaky = sorted(
        [{"step": k, "failRuns": v} for k, v in step_fail_counts.items()],
        key=lambda x: -x["failRuns"],
    )[:12]
    return JSONResponse(
        {
            "ok": True,
            "scenarioId": scenario_id,
            "recentRuns": window,
            "successRateLast20": rate,
            "flakySteps": flaky,
        }
    )


@app.get("/api/runs/compare", response_class=JSONResponse)
def api_compare_runs(request: Request, left: str, right: str) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    if not left.strip() or not right.strip():
        return JSONResponse({"ok": False, "error": "left and right run ids required"}, status_code=400)
    out: Dict[str, Any] = {"ok": True, "left": left.strip(), "right": right.strip(), "steps": []}
    try:
        rl = _read_json(OUTPUTS_DIR / left.strip() / "report.json")
        rr = _read_json(OUTPUTS_DIR / right.strip() / "report.json")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=404)
    sl = {int(s["step"]): s for s in (rl.get("steps") or []) if isinstance(s, dict) and s.get("step") is not None}
    sr = {int(s["step"]): s for s in (rr.get("steps") or []) if isinstance(s, dict) and s.get("step") is not None}
    all_n = sorted(set(sl.keys()) | set(sr.keys()))
    diff_rows = []
    for n in all_n:
        a = sl.get(n)
        b = sr.get(n)
        changed = False
        if (a is None) != (b is None):
            changed = True
        elif a and b:
            if bool(a.get("ok")) != bool(b.get("ok")):
                changed = True
            if int(a.get("durationMs") or 0) != int(b.get("durationMs") or 0):
                changed = True
            if (a.get("urlAfter") or "") != (b.get("urlAfter") or ""):
                changed = True
        diff_rows.append(
            {
                "step": n,
                "changed": changed,
                "left": a,
                "right": b,
            }
        )
    out["summary"] = {
        "leftOk": rl.get("okCount"),
        "leftFail": rl.get("failCount"),
        "leftMs": rl.get("totalMs"),
        "rightOk": rr.get("okCount"),
        "rightFail": rr.get("failCount"),
        "rightMs": rr.get("totalMs"),
    }
    out["steps"] = diff_rows
    return JSONResponse(out)


@app.post("/api/runs/{run_id}/debug-continue", response_class=JSONResponse)
def api_debug_continue(run_id: str, request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized
    run_dir = OUTPUTS_DIR / run_id.strip()
    if not run_dir.is_dir():
        return JSONResponse({"ok": False, "error": "Run not found"}, status_code=404)
    try:
        (run_dir / "_debug_continue").write_text("ok", encoding="utf-8")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return JSONResponse({"ok": True})


@app.get("/runs/compare", response_class=HTMLResponse)
def runs_compare_page(request: Request, a: str = "", b: str = "") -> HTMLResponse:
    return templates.TemplateResponse("compare_runs.html", {"request": request, "run_a": a.strip(), "run_b": b.strip()})


@app.get("/runs/{run_id}", response_class=HTMLResponse)
def run_live_page(run_id: str, request: Request) -> HTMLResponse:
    return templates.TemplateResponse("run.html", {"request": request, "run_id": run_id})


@app.post("/api/runs/{run_id}/derive-scenario", response_class=JSONResponse)
async def api_derive_scenario_from_run(run_id: str, request: Request) -> JSONResponse:
    """Create a new scenario using selectorUsed from a successful run."""
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized

    run_dir = OUTPUTS_DIR / run_id
    report_path = run_dir / "report.json"
    input_path = run_dir / "input.json"
    meta_path = run_dir / "meta.json"
    if not report_path.exists() or not input_path.exists():
        return JSONResponse({"ok": False, "error": "Run not found"}, status_code=404)

    report = _read_json(report_path)
    if isinstance(report, dict) and report.get("failCount", 1) != 0:
        return JSONResponse({"ok": False, "error": "Run is not successful (failCount>0)"}, status_code=400)

    raw = _read_json(input_path)
    if not isinstance(raw, dict) or not isinstance(raw.get("steps"), list):
        return JSONResponse({"ok": False, "error": "Invalid input.json"}, status_code=400)

    used_by_step: Dict[int, str] = {}
    for s in (report.get("steps") or []):
        if not isinstance(s, dict):
            continue
        try:
            no = int(s.get("step") or 0)
        except Exception:
            continue
        sel = str(s.get("selectorUsed") or "").strip()
        if no > 0 and sel and sel != "—":
            used_by_step[no] = sel

    new_steps = []
    for s in raw.get("steps") or []:
        if not isinstance(s, dict):
            continue
        step_no = int(s.get("step") or 0)
        action = str(s.get("action") or "")
        xpath = str(s.get("xpath") or "")
        params = s.get("params") if isinstance(s.get("params"), dict) else {}
        sel_used = used_by_step.get(step_no, "").strip()
        if sel_used and action not in {"navigate", "wait", "user_action", "separator"}:
            if xpath.strip() and xpath.strip() != sel_used:
                fx = params.get("fallbackXPaths")
                if not isinstance(fx, list):
                    fx = []
                if xpath not in fx:
                    fx = [xpath] + [x for x in fx if isinstance(x, str)]
                params["fallbackXPaths"] = fx[:30]
            s = {**s, "xpath": sel_used, "params": params}
        new_steps.append(s)

    scenario_id = "derived_" + run_id + "_" + time.strftime("%Y%m%d_%H%M%S")
    base_name = str(raw.get("name") or "scenario")
    new_name = f"{base_name} — stabilized ({time.strftime('%Y-%m-%d %H:%M')})"

    derived = dict(raw)
    derived["id"] = scenario_id
    derived["name"] = new_name
    derived["exportedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    scenario_source_id = None
    if meta_path.exists():
        try:
            scenario_source_id = json.loads(meta_path.read_text(encoding="utf-8")).get("scenarioId")
        except Exception:
            scenario_source_id = None
    derived["derivedFrom"] = {
        "runId": run_id,
        "scenarioId": scenario_source_id,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "type": "stabilizedSelectors",
    }
    derived["steps"] = new_steps

    _write_json(_scenario_path(scenario_id), derived)
    _snapshot_scenario(scenario_id)
    _jsonl_append(LOG_DIR / "web-runner.log", {"ts": time.time(), "level": "info", "event": "scenario_derived", "runId": run_id, "scenarioId": scenario_id})
    return JSONResponse({"ok": True, "scenario": {"id": scenario_id, "name": new_name}})


@app.get("/api/runs/{run_id}/events")
async def api_run_events(run_id: str, request: Request) -> Response:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized

    run_dir = OUTPUTS_DIR / run_id
    path = _run_events_path(run_dir)
    if not path.exists():
        return Response(status_code=404)

    async def gen():
        # Basic SSE tail of events.jsonl
        pos = 0
        yield b"retry: 1000\n\n"
        while True:
            if await request.is_disconnected():
                break
            if path.exists():
                data = await anyio.to_thread.run_sync(path.read_bytes)
                if pos < len(data):
                    chunk = data[pos:]
                    pos = len(data)
                    for line in chunk.splitlines():
                        if not line:
                            continue
                        yield b"data: " + line + b"\n\n"
            await anyio.sleep(0.5)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/logs", response_class=JSONResponse)
async def api_client_logs(request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized

    body = await request.json()
    if not isinstance(body, dict):
        return JSONResponse({"ok": False, "error": "Invalid body"}, status_code=400)
    entry = {
        "ts": time.time(),
        "source": "extension",
        "level": str(body.get("level") or "info"),
        "event": str(body.get("event") or "event"),
        "data": body.get("data"),
    }
    _jsonl_append(LOG_DIR / "extension.log", entry)
    return JSONResponse({"ok": True})


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "default_base_url": "",
            "default_headless": True,
            "default_slow_mo": 0,
            "default_viewport": "1280x720",
        },
    )

@app.get("/flow-editor", response_class=HTMLResponse)
def flow_editor_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("flow_editor.html", {"request": request})


@app.post("/run", response_class=HTMLResponse)
def run(
    request: Request,
    scenario_json: UploadFile = File(...),
    base_url: str = Form(""),
    variables_json: str = Form(""),
    headless: bool = Form(True),
    slow_mo_ms: int = Form(0),
    viewport: str = Form("1280x720"),
) -> HTMLResponse:
    raw_bytes = scenario_json.file.read()
    try:
        raw = json.loads(raw_bytes.decode("utf-8"))
    except Exception as e:
        return templates.TemplateResponse(
            "result.html",
            {"request": request, "error": f"Invalid JSON: {e}", "run_id": None},
            status_code=400,
        )

    try:
        scenario_name, steps = _parse_scenario(raw)
    except Exception as e:
        return templates.TemplateResponse(
            "result.html",
            {"request": request, "error": f"Invalid scenario format: {e}", "run_id": None},
            status_code=400,
        )

    variables: Dict[str, Any] = {}
    if base_url.strip():
        variables["baseUrl"] = base_url.strip()
    if variables_json.strip():
        try:
            v = json.loads(variables_json)
            if isinstance(v, dict):
                variables.update(v)
        except Exception as e:
            return templates.TemplateResponse(
                "result.html",
                {"request": request, "error": f"Invalid variables JSON: {e}", "run_id": None},
                status_code=400,
            )

    run_id = uuid.uuid4().hex[:12]
    run_dir = OUTPUTS_DIR / run_id
    _ensure_dir(run_dir)
    (run_dir / "input.json").write_bytes(raw_bytes)

    try:
        report = run_scenario(
            scenario_name,
            steps,
            variables=variables,
            headless=bool(headless),
            slow_mo_ms=int(slow_mo_ms or 0),
            viewport=str(viewport or "1280x720"),
            run_dir=run_dir,
        )
    except Exception as e:
        report = {"scenario": scenario_name, "okCount": 0, "failCount": 0, "totalMs": 0, "steps": [], "log": [], "error": str(e)}

    (run_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (run_dir / "log.txt").write_text("\n".join(report.get("log", [])), encoding="utf-8")

    return templates.TemplateResponse(
        "result.html",
        {"request": request, "error": None, "run_id": run_id, "report": report},
    )


@app.get("/runs/{run_id}/log", response_class=PlainTextResponse)
def run_log(run_id: str) -> PlainTextResponse:
    p = OUTPUTS_DIR / run_id / "log.txt"
    if not p.exists():
        return PlainTextResponse("Not found", status_code=404)
    return PlainTextResponse(p.read_text(encoding="utf-8"))


@app.get("/runs/{run_id}/report", response_class=PlainTextResponse)
def run_report(run_id: str) -> PlainTextResponse:
    p = OUTPUTS_DIR / run_id / "report.json"
    if not p.exists():
        return PlainTextResponse("Not found", status_code=404)
    return PlainTextResponse(p.read_text(encoding="utf-8"), media_type="application/json")


@app.get("/runs/{run_id}/screenshots/{name}", response_class=Response)
def run_screenshot(run_id: str, name: str) -> Response:
    p = OUTPUTS_DIR / run_id / "screenshots" / name
    if not p.exists():
        return Response(status_code=404)
    return Response(content=p.read_bytes(), media_type="image/png")

