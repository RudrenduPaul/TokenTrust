"""Ported in spirit from src/categories/tt01_compression_ratio.test.ts."""

from tokentrust.categories.tt01_compression_ratio import Tt01TaskResult, compute_average, compute_reduction_pct, run_tt01

from .conftest import FakeAdapter, make_task


def test_measures_reduction_across_tasks():
    tasks = [make_task(id="t1"), make_task(id="t2")]
    adapter = FakeAdapter(
        "rtk",
        baseline=lambda t: "x" * 400,
        compressed=lambda t: "x" * 100,
    )
    result = run_tt01(adapter, tasks, claimed_savings_pct=70)
    assert result.category == "TT01"
    assert result.task_corpus_size == 2
    assert len(result.per_task) == 2
    assert result.measured_savings_pct > 0
    assert all(not t.skipped for t in result.per_task)


def test_skips_a_task_when_tokenizer_flags_malformed_input():
    tasks = [make_task(id="t1")]
    adapter = FakeAdapter(
        "rtk",
        baseline=lambda t: "clean text",
        compressed=lambda t: "broken � output",
    )
    result = run_tt01(adapter, tasks, claimed_savings_pct=70)
    assert result.per_task[0].skipped is True
    assert result.per_task[0].skip_reason == "malformed or non-UTF8 input"
    # A fully-skipped batch reports 0% measured savings, not a crash.
    assert result.measured_savings_pct == 0


def test_progress_callback_invoked_once_per_task():
    tasks = [make_task(id="t1"), make_task(id="t2"), make_task(id="t3")]
    adapter = FakeAdapter("rtk", baseline=lambda t: "abc", compressed=lambda t: "a")
    calls = []
    run_tt01(adapter, tasks, claimed_savings_pct=None, on_progress=lambda d, tot: calls.append((d, tot)))
    assert calls == [(1, 3), (2, 3), (3, 3)]


def test_compute_reduction_pct_pure_helper():
    assert compute_reduction_pct(100, 50) == 50
    assert compute_reduction_pct(0, 0) == 0
    assert compute_reduction_pct(100, 100) == 0


def test_zero_baseline_tokens_yields_zero_reduction_not_division_error():
    tasks = [make_task(id="t1")]
    adapter = FakeAdapter("rtk", baseline=lambda t: "", compressed=lambda t: "")
    result = run_tt01(adapter, tasks, claimed_savings_pct=70)
    assert result.per_task[0].reduction_pct == 0


def test_compute_average_ignores_skipped_tasks():
    per_task = [
        Tt01TaskResult(task_id="a", tokens_before=100, tokens_after=50, reduction_pct=50, skipped=False),
        Tt01TaskResult(task_id="b", tokens_before=100, tokens_after=90, reduction_pct=10, skipped=False),
        Tt01TaskResult(task_id="c", tokens_before=0, tokens_after=0, reduction_pct=0, skipped=True),
    ]
    assert compute_average(per_task) == 30


def test_compute_average_empty_list_returns_zero():
    assert compute_average([]) == 0
