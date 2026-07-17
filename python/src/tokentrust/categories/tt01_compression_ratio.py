"""Ported from src/categories/tt01_compression_ratio.ts."""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from ..adapters.types import ProxyAdapter
from ..tasks.types import Task
from ..tokenizer import count

ProgressCallback = Callable[[int, int], None]


@dataclass(frozen=True)
class Tt01TaskResult:
    task_id: str
    tokens_before: int
    tokens_after: int
    reduction_pct: float
    skipped: bool
    skip_reason: Optional[str] = None


@dataclass(frozen=True)
class Tt01Result:
    category: str
    claimed_savings_pct: Optional[float]
    measured_savings_pct: float
    per_task: List[Tt01TaskResult] = field(default_factory=list)
    task_corpus_size: int = 0


def run_tt01(
    adapter: ProxyAdapter,
    tasks: List[Task],
    claimed_savings_pct: Optional[float],
    on_progress: Optional[ProgressCallback] = None,
) -> Tt01Result:
    """
    TT01 Compression Ratio Verification -- measures actual context-token
    reduction on a labeled task corpus with a real local tokenizer,
    compared against the proxy's own claimed/marketed reduction
    percentage.

    Named failure path: if the tokenizer flags a task's before or after
    text as malformed/non-UTF8, that task is skipped with a WARN and the
    batch continues -- it never crashes the run.
    """
    per_task: List[Tt01TaskResult] = []

    for i, task in enumerate(tasks):
        baseline = adapter.run(task, "baseline")
        compressed = adapter.run(task, "compressed")
        before = count(baseline.raw_output)
        after = count(compressed.raw_output)

        if before.skipped or after.skipped:
            reason = (before.reason if before.skipped else after.reason) or "unknown"
            print(f'[WARN] TT01: skipping task "{task.id}" -- {reason}', file=sys.stderr)
            per_task.append(
                Tt01TaskResult(
                    task_id=task.id,
                    tokens_before=0,
                    tokens_after=0,
                    reduction_pct=0,
                    skipped=True,
                    skip_reason=reason,
                )
            )
        else:
            reduction_pct = (
                0 if before.tokens == 0 else ((before.tokens - after.tokens) / before.tokens) * 100
            )
            per_task.append(
                Tt01TaskResult(
                    task_id=task.id,
                    tokens_before=before.tokens,
                    tokens_after=after.tokens,
                    reduction_pct=reduction_pct,
                    skipped=False,
                )
            )

        if on_progress:
            on_progress(i + 1, len(tasks))

    counted = [t for t in per_task if not t.skipped]
    measured_savings_pct = (
        sum(t.reduction_pct for t in counted) / len(counted) if counted else 0
    )

    return Tt01Result(
        category="TT01",
        claimed_savings_pct=claimed_savings_pct,
        measured_savings_pct=measured_savings_pct,
        per_task=per_task,
        task_corpus_size=len(tasks),
    )


def compute_reduction_pct(tokens_before: int, tokens_after: int) -> float:
    """Pure helper: computes reduction% directly from token counts, no adapter/tokenizer calls."""
    if tokens_before == 0:
        return 0
    return ((tokens_before - tokens_after) / tokens_before) * 100


def compute_average(per_task: List[Tt01TaskResult]) -> float:
    counted = [t for t in per_task if not t.skipped]
    if not counted:
        return 0
    return sum(t.reduction_pct for t in counted) / len(counted)
