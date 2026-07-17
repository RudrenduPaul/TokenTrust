"""Ported in spirit from src/categories/tt03_never_worse_guard.test.ts."""

from tokentrust.categories.tt03_never_worse_guard import evaluate_never_worse_guard, run_tt03

from .conftest import FakeAdapter, make_task


def test_passes_when_no_markers_missing_and_no_expansion():
    result = evaluate_never_worse_guard(
        "t1", raw_output="function foo() {}", compressed_output="function foo() {}", required_markers=["function foo"]
    )
    assert result.regressed is False
    assert result.missing_markers == []
    assert result.token_count_regressed is False


def test_fails_when_a_required_marker_is_dropped():
    result = evaluate_never_worse_guard(
        "t1", raw_output="function foo() {}", compressed_output="stripped", required_markers=["function foo"]
    )
    assert result.regressed is True
    assert "function foo" in result.missing_markers


def test_fails_when_compressed_output_has_more_tokens_than_raw():
    raw = "short"
    compressed = "this is a much much much longer expanded output than the original short raw text"
    result = evaluate_never_worse_guard("t1", raw_output=raw, compressed_output=compressed, required_markers=[])
    assert result.token_count_regressed is True
    assert result.regressed is True


def test_task_with_no_quality_markers_only_checks_token_expansion():
    result = evaluate_never_worse_guard("t1", raw_output="abc", compressed_output="a", required_markers=[])
    assert result.missing_markers == []
    assert result.regressed is False


def test_run_tt03_pass_true_when_zero_tasks_regressed():
    tasks = [make_task(id="t1", quality_markers=["keep me"])]
    adapter = FakeAdapter("rtk", baseline=lambda t: "keep me and more", compressed=lambda t: "keep me")
    result = run_tt03(adapter, tasks)
    assert result.pass_ is True
    assert result.regressed_count == 0


def test_run_tt03_pass_false_when_a_task_regresses():
    tasks = [make_task(id="t1", quality_markers=["keep me"])]
    adapter = FakeAdapter("rtk", baseline=lambda t: "keep me and more", compressed=lambda t: "dropped it")
    result = run_tt03(adapter, tasks)
    assert result.pass_ is False
    assert result.regressed_count == 1
