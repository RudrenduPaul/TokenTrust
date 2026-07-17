"""Ported in spirit from src/categories/tt04_cross_tool_benchmark.test.ts."""

import pytest

from tokentrust.categories.tt01_compression_ratio import Tt01Result, Tt01TaskResult
from tokentrust.categories.tt04_cross_tool_benchmark import CorpusMismatchError, run_tt04


def _tt01(task_ids, savings_pct):
    per_task = [
        Tt01TaskResult(task_id=tid, tokens_before=100, tokens_after=50, reduction_pct=50, skipped=False)
        for tid in task_ids
    ]
    return Tt01Result(
        category="TT01", claimed_savings_pct=None, measured_savings_pct=savings_pct,
        per_task=per_task, task_corpus_size=len(task_ids),
    )


def test_runs_side_by_side_comparison_across_identical_corpora():
    per_proxy = [
        {"proxy": "rtk", "tt01": _tt01(["a", "b"], 60.0)},
        {"proxy": "headroom", "tt01": _tt01(["a", "b"], 45.0)},
    ]
    result = run_tt04(per_proxy)
    assert result.category == "TT04"
    assert len(result.results) == 2
    assert result.task_corpus_size == 2


def test_raises_corpus_mismatch_error_on_non_identical_corpora():
    per_proxy = [
        {"proxy": "rtk", "tt01": _tt01(["a", "b"], 60.0)},
        {"proxy": "headroom", "tt01": _tt01(["a", "c"], 45.0)},
    ]
    with pytest.raises(CorpusMismatchError, match="identical task corpus"):
        run_tt04(per_proxy)


def test_single_proxy_never_raises_mismatch():
    per_proxy = [{"proxy": "rtk", "tt01": _tt01(["a"], 60.0)}]
    result = run_tt04(per_proxy)
    assert len(result.results) == 1
