"""Ported in spirit from src/report/json.test.ts and src/report/terminal.test.ts."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from tokentrust.report.json_report import build_report_record, generate_run_id, serialize_report
from tokentrust.report.terminal import (
    Tt01Summary,
    Tt02Summary,
    Tt03Summary,
    Tt05Summary,
    TerminalReportInput,
    render_progress,
    render_terminal_report,
)
from tokentrust.report.types import FullReport


def test_generate_run_id_matches_documented_shape():
    run_id = generate_run_id(datetime(2026, 7, 11, tzinfo=timezone.utc))
    assert re.match(r"^tt_2026-07-11_[0-9a-f]{6}$", run_id)


def test_build_report_record_rounds_measured_savings_to_2_decimals():
    record = build_report_record(
        "tt_2026-01-01_abcdef", "2026-01-01T00:00:00.000Z", "rtk", "0.43.0", "/repo",
        "TT01", 70, 33.33333, 23, None,
    )
    assert record.measured_savings_pct == 33.33


def test_serialize_report_produces_valid_json_with_expected_keys():
    report = FullReport(
        run_id="tt_2026-01-01_abcdef", timestamp="2026-01-01T00:00:00.000Z", repo="/repo",
        task_corpus_size=23, proxies=["rtk"], records=[], tt03={}, tt05={},
    )
    parsed = json.loads(serialize_report(report))
    assert parsed["run_id"] == "tt_2026-01-01_abcdef"
    assert parsed["proxies"] == ["rtk"]
    assert parsed["task_corpus_size"] == 23


def test_render_progress_format():
    assert render_progress(3, 23) == "Measuring... (3/23 tasks)"


def test_render_terminal_report_includes_all_sections():
    output = render_terminal_report(
        TerminalReportInput(
            proxy="rtk",
            proxy_version="0.43.0",
            repo="/repo",
            task_corpus_size=23,
            report_path="/repo/tokentrust-report-2026-07-11.json",
            tt01=Tt01Summary(
                claimed_label="up to 70% context reduction (rtk README)",
                measured_savings_pct=60.7,
                task_corpus_size=23,
                min_task={"id": "verify-go-build-filter", "pct": 0.0},
                max_task={"id": "verify-git-log-filter", "pct": 95.4},
            ),
            tt02=Tt02Summary(
                baseline_usd=0.02, compressed_usd=0.00, savings_pct=77.0, savings_usd=0.01,
                claimed_pct=70, task_corpus_size=23, pricing_model="claude-5-sonnet",
            ),
            tt03=Tt03Summary(pass_=False, regressed_count=2, task_corpus_size=23),
            tt05=Tt05Summary(pass_=True, message="No prior verified baseline for rtk on this repo -- this run establishes the first baseline."),
        )
    )
    assert "TT01 Compression Ratio" in output
    assert "60.7% average" in output
    assert "[FAIL]  TT03" in output
    assert "[PASS]  TT05" in output
    assert "directional measurement" in output
