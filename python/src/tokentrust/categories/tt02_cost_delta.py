"""Ported from src/categories/tt02_cost_delta.ts."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from .tt01_compression_ratio import Tt01TaskResult


@dataclass(frozen=True)
class PricingModel:
    # Human-readable label shown in reports, e.g. "claude-5-sonnet".
    name: str
    # USD per 1,000,000 input tokens.
    input_per_million_usd: float


# Local pricing table used by the default (free, no-API-call) path. This is
# a directional estimate, not a live billed total -- see --live mode below
# for the opt-in, provider-verified path.
DEFAULT_PRICING = PricingModel(name="claude-5-sonnet", input_per_million_usd=3)


@dataclass(frozen=True)
class Tt02Result:
    category: str
    claimed_savings_pct: Optional[float]
    baseline_usd: float
    compressed_usd: float
    savings_usd: float
    savings_pct: float
    task_corpus_size: int
    pricing_model: str
    live_verified: bool = False


def run_tt02_default(
    per_task: List[Tt01TaskResult],
    claimed_savings_pct: Optional[float],
    pricing: PricingModel = DEFAULT_PRICING,
) -> Tt02Result:
    """
    TT02 Cost-Savings Delta (default path) -- computes actual dollar-cost
    savings at current published model pricing from TT01's measured token
    delta. This is the free, local-only path: no API calls, near-zero
    marginal cost per run.
    """
    counted = [t for t in per_task if not t.skipped]
    total_before = sum(t.tokens_before for t in counted)
    total_after = sum(t.tokens_after for t in counted)

    baseline_usd = (total_before / 1_000_000) * pricing.input_per_million_usd
    compressed_usd = (total_after / 1_000_000) * pricing.input_per_million_usd
    savings_usd = baseline_usd - compressed_usd
    savings_pct = 0 if baseline_usd == 0 else (savings_usd / baseline_usd) * 100

    return Tt02Result(
        category="TT02",
        claimed_savings_pct=claimed_savings_pct,
        baseline_usd=baseline_usd,
        compressed_usd=compressed_usd,
        savings_usd=savings_usd,
        savings_pct=savings_pct,
        task_corpus_size=len(per_task),
        pricing_model=pricing.name,
        live_verified=False,
    )


# ---------------------------------------------------------------------------
# --live mode: opt-in provider-billed verification. This is the one real
# security/cost boundary in the system -- see the locked gate diagram below.
# No code path here ever reaches for an API key or fires a network call
# outside evaluate_live_gate's `allowed: True` branch and
# run_live_verification, both of which the CLI only invokes after the gate
# has already returned allowed=True.
# ---------------------------------------------------------------------------

LIVE_API_KEY_ENV_VAR = "TOKENTRUST_LIVE_API_KEY"
DEFAULT_LIVE_MAX_TASKS = 5


@dataclass(frozen=True)
class LiveModeOptions:
    live: bool
    confirm_cost: bool
    live_max_tasks: int


@dataclass(frozen=True)
class LiveGateResult:
    allowed: bool
    message: str
    estimated_cost_usd: float
    # Present only when the gate refuses to proceed.
    exit_code: Optional[int] = None


def estimate_live_cost(per_task: List[Tt01TaskResult], pricing: PricingModel = DEFAULT_PRICING) -> float:
    """
    Estimates the cost of a --live run from the free, local-tokenizer dry
    pass -- this is always computed BEFORE any gating decision, and is
    itself zero-cost (no network call).
    """
    total_before = sum(t.tokens_before for t in per_task)
    return (total_before / 1_000_000) * pricing.input_per_million_usd


def evaluate_live_gate(
    options: LiveModeOptions, task_count: int, estimated_cost_usd: float
) -> LiveGateResult:
    """
    Locked gate:

      --live alone            -> refuse, print cost estimate, EXIT 1, no API call
      --live --confirm-cost,
        task_count > cap      -> refuse, EXIT 1, no API call
      --live --confirm-cost,
        task_count <= cap     -> allowed

    This function makes no network call under any branch -- it only decides
    whether the caller (cli.py) may proceed to run_live_verification.
    """
    if not options.confirm_cost:
        return LiveGateResult(
            allowed=False,
            exit_code=1,
            estimated_cost_usd=estimated_cost_usd,
            message=(
                "--live requires --confirm-cost.\n"
                f"Estimated cost for this run: ${estimated_cost_usd:.4f} ({task_count} tasks).\n"
                "Re-run with: --live --confirm-cost\n"
                f"To change the task cap, add --live-max-tasks N (default {DEFAULT_LIVE_MAX_TASKS})."
            ),
        )

    if task_count > options.live_max_tasks:
        return LiveGateResult(
            allowed=False,
            exit_code=1,
            estimated_cost_usd=estimated_cost_usd,
            message=(
                f"Task count ({task_count}) exceeds --live-max-tasks ({options.live_max_tasks}).\n"
                "Reduce the task corpus or pass a higher --live-max-tasks value explicitly."
            ),
        )

    return LiveGateResult(
        allowed=True,
        estimated_cost_usd=estimated_cost_usd,
        message=(
            f"Live mode confirmed. Estimated cost: ${estimated_cost_usd:.4f} for {task_count} tasks "
            f"(capped at {options.live_max_tasks})."
        ),
    )


@dataclass(frozen=True)
class LiveApiCall:
    task_id: str
    billed_input_tokens: int


# Injected by the caller so tests can assert call counts without a real
# network dependency. The default implementation (cli.py wiring) reads the
# API key from os.environ[LIVE_API_KEY_ENV_VAR] only -- never from a CLI
# flag, since flags leak into shell history and CI logs.
LiveApiClient = Callable[[str, str, str], LiveApiCall]


def run_live_verification(
    tasks: List[dict],
    api_key: str,
    live_max_tasks: int,
    client: LiveApiClient,
    pricing: PricingModel = DEFAULT_PRICING,
) -> dict:
    """
    Runs the real, provider-billed verification sample -- only ever called
    after evaluate_live_gate has returned allowed=True. Capped at
    live_max_tasks tasks regardless of the caller-supplied task list
    length, as a defense-in-depth measure against a caller bug bypassing
    the gate's own cap check.
    """
    capped = tasks[:live_max_tasks]
    live_calls: List[LiveApiCall] = []
    for task in capped:
        result = client(task["id"], task["contextText"], api_key)
        live_calls.append(result)
    total_billed_tokens = sum(c.billed_input_tokens for c in live_calls)
    billed_usd = (total_billed_tokens / 1_000_000) * pricing.input_per_million_usd
    return {"live_calls": live_calls, "billed_usd": billed_usd}


def resolve_live_api_key(env: Optional[dict] = None) -> Optional[str]:
    env = env if env is not None else os.environ
    return env.get(LIVE_API_KEY_ENV_VAR)
