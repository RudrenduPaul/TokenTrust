"""Ported in spirit from src/categories/tt05_version_drift.test.ts."""

from __future__ import annotations

import json
import os
import shutil
import tempfile

import pytest

from tokentrust.categories.tt05_version_drift import (
    ReportStoreRun,
    append_run,
    find_latest_run,
    load_report_store,
    run_tt05,
    write_report_store,
)


@pytest.fixture()
def tmp_dir():
    d = tempfile.mkdtemp(prefix="tokentrust-store-")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def test_load_report_store_missing_file_degrades_gracefully(tmp_dir):
    loaded = load_report_store(os.path.join(tmp_dir, "does-not-exist.json"))
    assert loaded.existed is False
    assert loaded.corrupted is False
    assert loaded.store.runs == []


def test_load_report_store_corrupted_json_degrades_gracefully(tmp_dir):
    path = os.path.join(tmp_dir, "store.json")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("not valid json{{{")
    loaded = load_report_store(path)
    assert loaded.existed is True
    assert loaded.corrupted is True
    assert loaded.store.runs == []


def test_write_then_load_round_trips(tmp_dir):
    path = os.path.join(tmp_dir, "nested", "store.json")
    run = ReportStoreRun(
        run_id="tt_2026-01-01_abcdef", timestamp="2026-01-01T00:00:00.000Z", proxy="rtk",
        proxy_version="0.43.0", repo="/some/repo", measured_savings_pct=50.0, prior_run_id=None,
    )
    write_report_store(path, append_run(load_report_store(path).store, run))
    loaded = load_report_store(path)
    assert loaded.corrupted is False
    assert len(loaded.store.runs) == 1
    assert loaded.store.runs[0].run_id == "tt_2026-01-01_abcdef"


def test_find_latest_run_returns_most_recent_matching_proxy_repo(tmp_dir):
    runs = [
        ReportStoreRun("r1", "2026-01-01T00:00:00.000Z", "rtk", "0.1.0", "/repo", 40.0, None),
        ReportStoreRun("r2", "2026-01-02T00:00:00.000Z", "rtk", "0.2.0", "/repo", 45.0, "r1"),
        ReportStoreRun("r3", "2026-01-01T00:00:00.000Z", "headroom", "0.1.0", "/repo", 10.0, None),
    ]
    from tokentrust.categories.tt05_version_drift import ReportStore

    store = ReportStore(runs=runs)
    latest = find_latest_run(store, "rtk", "/repo")
    assert latest.run_id == "r2"


def test_run_tt05_first_baseline_passes_with_no_prior_run():
    from tokentrust.categories.tt05_version_drift import LoadedStore, ReportStore

    loaded = LoadedStore(store=ReportStore(runs=[]), corrupted=False, existed=False)
    result = run_tt05(loaded, "rtk", "/repo", measured_savings_pct=50.0)
    assert result.pass_ is True
    assert result.prior_run_id is None
    assert "first baseline" in result.message


def test_run_tt05_flags_regression_beyond_threshold():
    from tokentrust.categories.tt05_version_drift import LoadedStore, ReportStore

    prior = ReportStoreRun("r1", "2026-01-01T00:00:00.000Z", "rtk", "0.43.0", "/repo", 60.0, None)
    loaded = LoadedStore(store=ReportStore(runs=[prior]), corrupted=False, existed=True)
    result = run_tt05(loaded, "rtk", "/repo", measured_savings_pct=40.0)  # -20pp drop
    assert result.pass_ is False
    assert result.prior_run_id == "r1"
    assert "Regression" in result.message


def test_run_tt05_small_drop_within_threshold_still_passes():
    from tokentrust.categories.tt05_version_drift import LoadedStore, ReportStore

    prior = ReportStoreRun("r1", "2026-01-01T00:00:00.000Z", "rtk", "0.43.0", "/repo", 60.0, None)
    loaded = LoadedStore(store=ReportStore(runs=[prior]), corrupted=False, existed=True)
    result = run_tt05(loaded, "rtk", "/repo", measured_savings_pct=58.0)  # -2pp drop, under 5pp threshold
    assert result.pass_ is True


def test_run_tt05_corrupted_store_degrades_to_pass_true():
    from tokentrust.categories.tt05_version_drift import LoadedStore, ReportStore

    loaded = LoadedStore(store=ReportStore(runs=[]), corrupted=True, existed=True)
    result = run_tt05(loaded, "rtk", "/repo", measured_savings_pct=50.0)
    assert result.pass_ is True
    assert result.degraded is True
