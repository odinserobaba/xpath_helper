#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import anyio

# Reuse runner logic
from app import (  # noqa: E402
    OUTPUTS_DIR,
    _ensure_dir,
    _mask_secrets,
    _parse_scenario,
    _read_json,
    _scenario_path,
    _write_html_report,
    run_scenario,
)


def _load_json_file(path: Optional[str]) -> Any:
    if not path:
        return None
    p = Path(path)
    return json.loads(p.read_text(encoding="utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description="Run XPath Helper scenario via Playwright (CI-friendly).")
    ap.add_argument("--scenario-id", required=True, help="Scenario id (file stem in tests/scenarios)")
    ap.add_argument("--base-url", default="", help="baseUrl variable")
    ap.add_argument("--vars-json", default="", help="JSON string with variables")
    ap.add_argument("--vars-file", default="", help="Path to JSON file with variables")
    ap.add_argument("--data-file", default="", help="Path to JSON file with rows (list of objects)")
    ap.add_argument("--max-rows", type=int, default=0, help="0 = all rows")
    ap.add_argument("--stop-on-first-fail", action="store_true", help="Stop data-driven on first failed row")
    ap.add_argument("--start-url", default="", help="Start URL before steps")
    ap.add_argument("--headless", action="store_true", help="Headless mode")
    ap.add_argument("--slowmo-ms", type=int, default=0, help="SlowMo in ms")
    ap.add_argument("--viewport", default="1280x720", help="Viewport WxH")
    ap.add_argument("--default-timeout-ms", type=int, default=15000, help="Default step timeout")
    ap.add_argument("--outputs-dir", default="", help="Override outputs dir (default web-runner/outputs)")
    args = ap.parse_args()

    scenario_path = _scenario_path(args.scenario_id)
    if not scenario_path.exists():
        print(f"Scenario not found: {scenario_path}", file=sys.stderr)
        return 2

    raw = _read_json(scenario_path)
    scenario_name, steps = _parse_scenario(raw)

    variables: Dict[str, Any] = {}
    if args.base_url.strip():
        variables["baseUrl"] = args.base_url.strip()

    if args.vars_json.strip():
        variables.update(json.loads(args.vars_json))
    if args.vars_file.strip():
        v = _load_json_file(args.vars_file)
        if isinstance(v, dict):
            variables.update(v)

    data_rows = _load_json_file(args.data_file) if args.data_file else None
    if isinstance(raw, dict) and isinstance(raw.get("runnerSettings"), dict):
        rs = raw.get("runnerSettings") or {}
        # only fill missing
        args.start_url = args.start_url or str(rs.get("startUrl") or "")
        args.viewport = args.viewport or str(rs.get("viewport") or "1280x720")
        args.default_timeout_ms = args.default_timeout_ms or int(rs.get("defaultTimeoutMs") or 15000)

    out_root = Path(args.outputs_dir) if args.outputs_dir else OUTPUTS_DIR
    run_id = f"cli_{int(time.time())}"
    run_dir = out_root / run_id
    _ensure_dir(run_dir)
    (run_dir / "meta.json").write_text(
        json.dumps(
            _mask_secrets(
                {
                    "runId": run_id,
                    "scenarioId": args.scenario_id,
                    "scenarioName": scenario_name,
                    "startedAtTs": time.time(),
                    "settings": {
                        "startUrl": args.start_url,
                        "baseUrl": args.base_url,
                        "headless": bool(args.headless),
                        "slowMoMs": args.slowmo_ms,
                        "viewport": args.viewport,
                        "defaultTimeoutMs": args.default_timeout_ms,
                        "variables": variables,
                        "dataRowsCount": len(data_rows) if isinstance(data_rows, list) else 0,
                    },
                }
            ),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    async def run() -> Dict[str, Any]:
        if isinstance(data_rows, list) and data_rows:
            rows = [r for r in data_rows if isinstance(r, dict)]
            if args.max_rows and args.max_rows > 0:
                rows = rows[: args.max_rows]
            row_reports = []
            total_ok = 0
            total_fail = 0
            t0 = time.time()
            for i, row in enumerate(rows):
                if args.stop_on_first_fail and total_fail > 0:
                    break
                row_vars = dict(variables)
                row_vars.update(row)
                rep = await anyio.to_thread.run_sync(
                    lambda: run_scenario(
                        scenario_name,
                        steps,
                        variables=row_vars,
                        start_url=args.start_url,
                        default_timeout_ms=args.default_timeout_ms,
                        headless=bool(args.headless),
                        slow_mo_ms=args.slowmo_ms,
                        viewport=args.viewport,
                        run_dir=run_dir / "rows" / f"row_{i+1}",
                    )
                )
                row_reports.append(rep)
                if rep.get("failCount", 0) > 0:
                    total_fail += 1
                else:
                    total_ok += 1
            return {
                "scenario": scenario_name,
                "dataDriven": True,
                "rowsTotal": len(rows),
                "rowsOk": total_ok,
                "rowsFail": total_fail,
                "totalMs": int((time.time() - t0) * 1000),
                "rowReports": [{"rowIndex": i, "okCount": r.get("okCount"), "failCount": r.get("failCount"), "totalMs": r.get("totalMs")} for i, r in enumerate(row_reports)],
            }
        return await anyio.to_thread.run_sync(
            lambda: run_scenario(
                scenario_name,
                steps,
                variables=variables,
                start_url=args.start_url,
                default_timeout_ms=args.default_timeout_ms,
                headless=bool(args.headless),
                slow_mo_ms=args.slowmo_ms,
                viewport=args.viewport,
                run_dir=run_dir,
            )
        )

    report = anyio.run(run)
    (run_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if isinstance(report, dict) and report.get("steps"):
        _write_html_report(run_dir, report)

    # exit code: 0 if ok, 1 if any fail
    if report.get("dataDriven"):
        return 0 if report.get("rowsFail", 0) == 0 else 1
    return 0 if report.get("failCount", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

