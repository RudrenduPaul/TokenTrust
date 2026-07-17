"""Ported from src/categories/tt05_version_drift.ts."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from ..adapters.types import ProxyName

DEFAULT_STORE_PATH = os.path.join(".tokentrust", "report-store.json")
# A drop of more than this many percentage points vs. the prior baseline counts as a regression.
DEFAULT_REGRESSION_THRESHOLD_PCT = 5


@dataclass(frozen=True)
class ReportStoreRun:
    run_id: str
    timestamp: str
    proxy: ProxyName
    proxy_version: str
    repo: str
    measured_savings_pct: float
    prior_run_id: Optional[str]


@dataclass
class ReportStore:
    runs: List[ReportStoreRun] = field(default_factory=list)


@dataclass(frozen=True)
class LoadedStore:
    store: ReportStore
    corrupted: bool
    existed: bool


def load_report_store(path: str) -> LoadedStore:
    """
    Named failure path: a missing or corrupted store must degrade to "no
    drift comparison available," not crash TT05. Missing is expected on a
    repo's first run (existed=False, corrupted=False); corrupted
    (existed=True, corrupted=True) means the file was present but not
    valid JSON / not the expected shape.
    """
    if not os.path.exists(path):
        return LoadedStore(store=ReportStore(runs=[]), corrupted=False, existed=False)

    try:
        with open(path, "r", encoding="utf-8") as fh:
            parsed = json.load(fh)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("runs"), list):
            raise ValueError('report store is missing a valid "runs" array')
        runs = [
            ReportStoreRun(
                run_id=r["runId"],
                timestamp=r["timestamp"],
                proxy=r["proxy"],
                proxy_version=r["proxyVersion"],
                repo=r["repo"],
                measured_savings_pct=r["measuredSavingsPct"],
                prior_run_id=r.get("priorRunId"),
            )
            for r in parsed["runs"]
        ]
        return LoadedStore(store=ReportStore(runs=runs), corrupted=False, existed=True)
    except Exception:  # noqa: BLE001 - any parse/shape failure degrades gracefully
        return LoadedStore(store=ReportStore(runs=[]), corrupted=True, existed=True)


def find_latest_run(store: ReportStore, proxy: ProxyName, repo: str) -> Optional[ReportStoreRun]:
    matches = [r for r in store.runs if r.proxy == proxy and r.repo == repo]
    if not matches:
        return None
    return max(matches, key=lambda r: _parse_iso(r.timestamp))


def _parse_iso(timestamp: str) -> datetime:
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))


@dataclass(frozen=True)
class Tt05Result:
    category: str
    pass_: bool
    message: str
    prior_run_id: Optional[str]
    # True when this result came from a graceful-degradation path (store missing/corrupted).
    degraded: bool


def run_tt05(
    loaded: LoadedStore,
    proxy: ProxyName,
    repo: str,
    measured_savings_pct: float,
    regression_threshold_pct: float = DEFAULT_REGRESSION_THRESHOLD_PCT,
) -> Tt05Result:
    """
    TT05 Version-Drift Regression Detection -- compares this run's measured
    savings against the last-verified baseline for the same proxy/repo
    pair, chained via prior_run_id. Directly targets the rtk#582/#1935-style
    failure pattern: a proxy silently getting worse after a version bump.
    """
    if loaded.corrupted:
        print(
            "[WARN] TT05: report store is corrupted or unreadable -- no drift comparison available.",
            file=sys.stderr,
        )
        return Tt05Result(
            category="TT05",
            pass_=True,
            message=(
                "No drift comparison available -- the local report store was corrupted or "
                "unreadable. This run establishes a fresh measurement history."
            ),
            prior_run_id=None,
            degraded=True,
        )

    prior = find_latest_run(loaded.store, proxy, repo)
    if not prior:
        return Tt05Result(
            category="TT05",
            pass_=True,
            message=(
                f"No prior verified baseline for {proxy} on this repo -- this run establishes "
                "the first baseline."
            ),
            prior_run_id=None,
            degraded=False,
        )

    delta = measured_savings_pct - prior.measured_savings_pct
    regressed = delta < -regression_threshold_pct
    stored_date = prior.timestamp[:10]
    if regressed:
        message = (
            f"Regression vs. last-verified {proxy} {prior.proxy_version} baseline "
            f"(stored {stored_date}): measured savings dropped from "
            f"{prior.measured_savings_pct:.1f}% to {measured_savings_pct:.1f}%."
        )
    else:
        message = f"No regression vs. last-verified {proxy} {prior.proxy_version} baseline (stored {stored_date})."

    return Tt05Result(
        category="TT05",
        pass_=not regressed,
        message=message,
        prior_run_id=prior.run_id,
        degraded=False,
    )


def append_run(store: ReportStore, run: ReportStoreRun) -> ReportStore:
    return ReportStore(runs=[*store.runs, run])


def write_report_store(path: str, store: ReportStore) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {
        "runs": [
            {
                "runId": r.run_id,
                "timestamp": r.timestamp,
                "proxy": r.proxy,
                "proxyVersion": r.proxy_version,
                "repo": r.repo,
                "measuredSavingsPct": r.measured_savings_pct,
                "priorRunId": r.prior_run_id,
            }
            for r in store.runs
        ]
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
