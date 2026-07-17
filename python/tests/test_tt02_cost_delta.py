"""Ported in spirit from src/categories/tt02_cost_delta.test.ts."""

from tokentrust.categories.tt01_compression_ratio import Tt01TaskResult
from tokentrust.categories.tt02_cost_delta import (
    DEFAULT_LIVE_MAX_TASKS,
    LiveApiCall,
    LiveModeOptions,
    estimate_live_cost,
    evaluate_live_gate,
    resolve_live_api_key,
    run_live_verification,
    run_tt02_default,
)


def _task_result(before: int, after: int, skipped: bool = False) -> Tt01TaskResult:
    reduction = 0 if before == 0 else ((before - after) / before) * 100
    return Tt01TaskResult(
        task_id="t", tokens_before=before, tokens_after=after, reduction_pct=reduction, skipped=skipped
    )


def test_computes_baseline_compressed_and_savings():
    per_task = [_task_result(1_000_000, 500_000)]
    result = run_tt02_default(per_task, claimed_savings_pct=70)
    assert result.baseline_usd == 3.0
    assert result.compressed_usd == 1.5
    assert result.savings_usd == 1.5
    assert result.savings_pct == 50
    assert result.live_verified is False


def test_excludes_skipped_tasks_from_totals():
    per_task = [_task_result(1_000_000, 500_000), _task_result(0, 0, skipped=True)]
    result = run_tt02_default(per_task, claimed_savings_pct=70)
    assert result.baseline_usd == 3.0


def test_zero_baseline_usd_yields_zero_savings_pct_not_division_error():
    per_task = [_task_result(0, 0)]
    result = run_tt02_default(per_task, claimed_savings_pct=None)
    assert result.savings_pct == 0


class TestLiveGate:
    def test_refuses_without_confirm_cost(self):
        gate = evaluate_live_gate(
            LiveModeOptions(live=True, confirm_cost=False, live_max_tasks=5), 5, 0.01
        )
        assert gate.allowed is False
        assert gate.exit_code == 1
        assert "--confirm-cost" in gate.message

    def test_refuses_when_task_count_exceeds_cap(self):
        gate = evaluate_live_gate(
            LiveModeOptions(live=True, confirm_cost=True, live_max_tasks=3), 10, 0.01
        )
        assert gate.allowed is False
        assert gate.exit_code == 1
        assert "exceeds --live-max-tasks" in gate.message

    def test_allows_when_confirmed_and_under_cap(self):
        gate = evaluate_live_gate(
            LiveModeOptions(live=True, confirm_cost=True, live_max_tasks=5), 5, 0.01
        )
        assert gate.allowed is True
        assert gate.exit_code is None

    def test_default_live_max_tasks_is_5(self):
        assert DEFAULT_LIVE_MAX_TASKS == 5


def test_estimate_live_cost_uses_before_tokens_only():
    per_task = [_task_result(1_000_000, 100)]
    assert estimate_live_cost(per_task) == 3.0


def test_run_live_verification_caps_at_live_max_tasks_defense_in_depth():
    tasks = [{"id": f"t{i}", "contextText": "x"} for i in range(10)]
    calls = []

    def fake_client(task_id, context_text, api_key):
        calls.append(task_id)
        return LiveApiCall(task_id=task_id, billed_input_tokens=100)

    result = run_live_verification(tasks, "fake-key", live_max_tasks=3, client=fake_client)
    assert len(calls) == 3
    assert len(result["live_calls"]) == 3


def test_resolve_live_api_key_reads_only_from_env():
    assert resolve_live_api_key({"TOKENTRUST_LIVE_API_KEY": "secret"}) == "secret"
    assert resolve_live_api_key({}) is None
