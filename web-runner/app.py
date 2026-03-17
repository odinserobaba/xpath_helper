from __future__ import annotations

import base64
import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import anyio
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.templating import Jinja2Templates
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
OUTPUTS_DIR = BASE_DIR / "outputs"
TEMPLATES_DIR = BASE_DIR / "templates"
SCENARIOS_DIR = REPO_ROOT / "tests" / "scenarios"
LOG_DIR = REPO_ROOT / "tests" / "logs"
RUNNER_TOKEN = os.environ.get("XPATH_RUNNER_TOKEN", "").strip() or None

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
app = FastAPI(title="XPath Helper — Web Runner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


ALLOWED_ACTIONS = {
    "click",
    "click_if_exists",
    "input",
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
        steps.append(Step(step=step_no, xpath=str(xpath), action=str(action), params=params))

    steps.sort(key=lambda x: x.step)
    return name, steps

def _scenario_steps_count(raw: Any) -> int:
    try:
        _, steps = _parse_scenario(raw)
        return len(steps)
    except Exception:
        return 0


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


def run_scenario(
    scenario_name: str,
    steps: List[Step],
    *,
    variables: Dict[str, Any],
    start_url: str,
    default_timeout_ms: int,
    headless: bool,
    slow_mo_ms: int,
    viewport: str,
    run_dir: Path,
) -> Dict[str, Any]:
    logs: List[str] = []
    results: List[Dict[str, Any]] = []
    t0 = time.time()

    width, height = 1280, 720
    try:
        w, h = viewport.lower().split("x", 1)
        width, height = int(w), int(h)
    except Exception:
        pass

    _log_line(logs, f"Scenario: {scenario_name}")
    _log_line(logs, f"Steps: {len(steps)}")
    _log_line(logs, f"Headless: {headless}, slowMoMs: {slow_mo_ms}, viewport: {width}x{height}")
    _emit_run_event(run_dir, {"ts": time.time(), "event": "run_start", "scenario": scenario_name, "stepsCount": len(steps)})

    _jsonl_append(
        LOG_DIR / "web-runner.log",
        {"ts": time.time(), "level": "info", "event": "playwright_launch", "runId": run_dir.name, "scenario": scenario_name},
    )
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless, slow_mo=slow_mo_ms)
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()

        def screenshot(name: str) -> Optional[str]:
            try:
                shots = run_dir / "screenshots"
                _ensure_dir(shots)
                path = shots / f"{name}.png"
                page.screenshot(path=str(path), full_page=True)
                return str(path.relative_to(run_dir))
            except Exception:
                return None

        try:
            if start_url:
                _log_line(logs, f"Start URL: {start_url}")
                page.goto(start_url, wait_until="domcontentloaded", timeout=30_000)
                _emit_run_event(run_dir, {"ts": time.time(), "event": "navigated", "url": start_url})

            idx = 0
            while idx < len(steps):
                s = steps[idx]
                step_t0 = time.time()
                ok = True
                err = ""
                shot = None

                # Substitute variables in commonly used fields
                xpath = _substitute_vars(s.xpath, variables)
                params = {
                    k: (_substitute_vars(v, variables) if isinstance(v, str) else v)
                    for k, v in (s.params or {}).items()
                }
                step_timeout_ms = int(params.get("timeoutMs") or default_timeout_ms or 5000)

                _log_line(logs, f"#{s.step} {s.action} xpath={xpath[:120]!r}")
                _emit_run_event(
                    run_dir,
                    {"ts": time.time(), "event": "step_start", "step": s.step, "action": s.action, "xpath": xpath, "timeoutMs": step_timeout_ms},
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
                    if s.action == "navigate":
                        url = params.get("url") or ""
                        url = _substitute_vars(str(url), variables)
                        if not url:
                            raise ValueError("navigate.params.url is required")
                        page.goto(url, wait_until="domcontentloaded", timeout=30_000)

                    elif s.action == "wait":
                        delay_ms = int(params.get("delayMs") or 500)
                        page.wait_for_timeout(max(0, delay_ms))

                    elif s.action == "wait_for_element":
                        if not xpath:
                            raise ValueError("wait_for_element requires xpath")
                        page.locator(f"xpath={xpath}").first.wait_for(state="visible", timeout=max(0, step_timeout_ms))

                    elif s.action == "click_if_exists":
                        if not xpath:
                            raise ValueError("click_if_exists requires xpath")
                        loc = page.locator(f"xpath={xpath}").first
                        if loc.count() > 0:
                            loc.wait_for(state="visible", timeout=max(0, step_timeout_ms))
                            loc.click(timeout=max(0, step_timeout_ms))

                    elif s.action == "click":
                        if not xpath:
                            raise ValueError("click requires xpath")
                        loc = page.locator(f"xpath={xpath}").first
                        loc.wait_for(state="visible", timeout=max(0, step_timeout_ms))
                        loc.click(timeout=max(0, step_timeout_ms))

                    elif s.action == "input":
                        if not xpath:
                            raise ValueError("input requires xpath")
                        value = params.get("value")
                        if value is None:
                            value = ""
                        loc = page.locator(f"xpath={xpath}").first
                        loc.wait_for(state="visible", timeout=max(0, step_timeout_ms))
                        loc.fill(str(value), timeout=max(0, step_timeout_ms))

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
                        loc = page.locator(f"xpath={xpath}").first
                        loc.wait_for(state="attached", timeout=max(0, step_timeout_ms))
                        loc.set_input_files(str(file_path), timeout=max(0, max(step_timeout_ms, 10_000)))

                    elif s.action == "user_action":
                        # In extension this is a manual pause. Here we just log and continue.
                        message = str(params.get("message") or "user_action")
                        _log_line(logs, f"User action (skipped): {message}")

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
                            # In export JSON we don't have ids; we support numeric jumps in params.
                            next_step = params.get("nextStep") or params.get("next") or params.get("nextId")
                            else_step = params.get("nextElseStep") or params.get("nextElse") or params.get("nextElseId")
                            target = next_step if condition_ok else else_step
                            if target not in (None, "", 0):
                                try:
                                    target_no = int(target)
                                    # jump to step number (1-based in JSON export)
                                    new_idx = next((j for j, st in enumerate(steps) if st.step == target_no), None)
                                    if new_idx is not None:
                                        idx = new_idx
                                        results.append(
                                            {
                                                "step": s.step,
                                                "action": s.action,
                                                "ok": ok,
                                                "durationMs": int((time.time() - step_t0) * 1000),
                                                "error": err or None,
                                                "screenshot": shot,
                                                "branchResult": condition_ok,
                                                "jumpTo": target_no,
                                            }
                                        )
                                        continue
                                except Exception:
                                    pass

                    else:
                        raise ValueError(f"Unsupported action: {s.action}")

                except (PlaywrightTimeoutError, PlaywrightError, AssertionError, ValueError) as e:
                    ok = False
                    err = str(e)
                    shot = screenshot(f"step_{s.step}_fail")
                    _log_line(logs, f"✗ FAIL step {s.step}: {err}")
                    _emit_run_event(
                        run_dir,
                        {"ts": time.time(), "event": "step_done", "step": s.step, "action": s.action, "ok": False, "error": err, "screenshot": shot},
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
                        },
                    )
                else:
                    _log_line(logs, f"✓ OK step {s.step}")
                    _emit_run_event(
                        run_dir,
                        {"ts": time.time(), "event": "step_done", "step": s.step, "action": s.action, "ok": True},
                    )
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
                        },
                    )

                results.append(
                    {
                        "step": s.step,
                        "action": s.action,
                        "ok": ok,
                        "durationMs": int((time.time() - step_t0) * 1000),
                        "error": err or None,
                        "screenshot": shot,
                    }
                )

                # stop on hard fail unless step says mandatory=false
                mandatory = bool(params.get("mandatory", True))
                if not ok and mandatory:
                    break

                idx += 1

        finally:
            context.close()
            browser.close()

    total_ms = int((time.time() - t0) * 1000)
    ok_count = sum(1 for r in results if r["ok"])
    fail_count = sum(1 for r in results if not r["ok"])

    _emit_run_event(run_dir, {"ts": time.time(), "event": "run_done", "okCount": ok_count, "failCount": fail_count, "totalMs": total_ms})
    return {
        "scenario": scenario_name,
        "okCount": ok_count,
        "failCount": fail_count,
        "totalMs": total_ms,
        "steps": results,
        "log": logs,
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
        if isinstance(raw, dict):
            name = str(raw.get("name") or "")
            exported_at = str(raw.get("exportedAt") or "")
            version = raw.get("version")
        items.append(
            {
                "id": p.stem,
                "file": p.name,
                "name": name or p.stem,
                "exportedAt": exported_at or None,
                "version": version,
                "stepsCount": _scenario_steps_count(raw),
                "mtime": int(p.stat().st_mtime),
            }
        )
    return JSONResponse({"ok": True, "scenarios": items})


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
    return JSONResponse({"ok": True, "scenario": {"id": scenario_id, "name": name, "stepsCount": len(steps)}})


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


@app.post("/api/runs", response_class=JSONResponse)
async def api_run_scenario(request: Request) -> JSONResponse:
    unauthorized = _require_token(request)
    if unauthorized:
        return unauthorized

    body = await request.json()
    scenario_id = str(body.get("scenarioId") or "").strip()
    if not scenario_id:
        return JSONResponse({"ok": False, "error": "scenarioId is required"}, status_code=400)

    path = SCENARIOS_DIR / f"{scenario_id}.json"
    if not path.exists():
        return JSONResponse({"ok": False, "error": "Scenario not found"}, status_code=404)

    raw_bytes = path.read_bytes()
    raw = json.loads(raw_bytes.decode("utf-8"))
    scenario_name, steps = _parse_scenario(raw)

    variables: Dict[str, Any] = {}
    base_url = str(body.get("baseUrl") or "").strip()
    if base_url:
        variables["baseUrl"] = base_url
    extra_vars = body.get("variables") or {}
    if isinstance(extra_vars, dict):
        variables.update(extra_vars)

    headless = bool(body.get("headless", True))
    slow_mo_ms = int(body.get("slowMoMs") or 0)
    viewport = str(body.get("viewport") or "1280x720")
    start_url = str(body.get("startUrl") or "").strip()
    default_timeout_ms = int(body.get("defaultTimeoutMs") or 15000)

    run_id = uuid.uuid4().hex[:12]
    run_dir = OUTPUTS_DIR / run_id
    _ensure_dir(run_dir)
    (run_dir / "input.json").write_bytes(raw_bytes)
    # Initialize events file early so UI can attach immediately.
    _emit_run_event(run_dir, {"ts": time.time(), "event": "created", "runId": run_id, "scenarioId": scenario_id, "scenario": scenario_name})

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

    try:
        # Playwright Sync API must not run inside asyncio loop.
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
                run_dir=run_dir,
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

    (run_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (run_dir / "log.txt").write_text("\n".join(report.get("log", [])), encoding="utf-8")

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

    return JSONResponse({"ok": True, "runId": run_id, "report": report})


@app.get("/runs/{run_id}", response_class=HTMLResponse)
def run_live_page(run_id: str, request: Request) -> HTMLResponse:
    return templates.TemplateResponse("run.html", {"request": request, "run_id": run_id})


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

