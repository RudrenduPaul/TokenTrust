"""
Ported from src/report/json.ts. Named `json_report` (not `json`) so it
never shadows the stdlib `json` module it imports.
"""

from __future__ import annotations

import json
import math
import secrets
from datetime import datetime, timezone
from typing import Optional

from ..adapters.types import ProxyName
from .types import CategoryId, FullReport, ReportRecord


def generate_run_id(now: Optional[datetime] = None) -> str:
    """Produces the documented run_id shape: tt_2026-07-11_4f2a9c"""
    now = now or datetime.now(timezone.utc)
    date_part = now.strftime("%Y-%m-%d")
    random_part = secrets.token_hex(3)
    return f"tt_{date_part}_{random_part}"


def build_report_record(
    run_id: str,
    timestamp: str,
    proxy: ProxyName,
    proxy_version: str,
    repo: str,
    category: CategoryId,
    claimed_savings_pct: Optional[float],
    measured_savings_pct: float,
    task_corpus_size: int,
    prior_run_id: Optional[str],
) -> ReportRecord:
    return ReportRecord(
        run_id=run_id,
        timestamp=timestamp,
        proxy=proxy,
        proxy_version=proxy_version,
        repo=repo,
        category=category,
        claimed_savings_pct=claimed_savings_pct,
        measured_savings_pct=_round_to(measured_savings_pct, 2),
        task_corpus_size=task_corpus_size,
        prior_run_id=prior_run_id,
    )


def _report_to_dict(report: FullReport) -> dict:
    return {
        "run_id": report.run_id,
        "timestamp": report.timestamp,
        "repo": report.repo,
        "task_corpus_size": report.task_corpus_size,
        "proxies": report.proxies,
        "records": [
            {
                "run_id": r.run_id,
                "timestamp": r.timestamp,
                "proxy": r.proxy,
                "proxy_version": r.proxy_version,
                "repo": r.repo,
                "category": r.category,
                "claimed_savings_pct": r.claimed_savings_pct,
                "measured_savings_pct": r.measured_savings_pct,
                "task_corpus_size": r.task_corpus_size,
                "prior_run_id": r.prior_run_id,
            }
            for r in report.records
        ],
        "tt03": {
            proxy: {
                "pass": entry.pass_,
                "regressed_count": entry.regressed_count,
                "task_corpus_size": entry.task_corpus_size,
            }
            for proxy, entry in report.tt03.items()
        },
        "tt05": {
            proxy: {
                "pass": entry.pass_,
                "message": entry.message,
                "prior_run_id": entry.prior_run_id,
                "degraded": entry.degraded,
            }
            for proxy, entry in report.tt05.items()
        },
    }


def serialize_report(report: FullReport) -> str:
    return json.dumps(_report_to_dict(report), indent=2)


def write_report(report: FullReport, out_path: str) -> None:
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(serialize_report(report))


def _round_to(value: float, decimals: int) -> float:
    """
    Round-half-up, matching JS `Math.round()` exactly (Python's built-in
    `round()` uses banker's/round-half-to-even rounding, which can differ
    from the TS source's `Math.round(value * factor) / factor` on exact
    .5 boundaries).
    """
    factor = 10**decimals
    return math.floor(value * factor + 0.5) / factor

