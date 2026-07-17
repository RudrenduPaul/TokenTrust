"""Ported from src/categories/tt03_never_worse_guard.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional

from ..adapters.types import ProxyAdapter
from ..tasks.types import Task
from ..tokenizer import count

ProgressCallback = Callable[[int, int], None]


@dataclass(frozen=True)
class Tt03TaskResult:
    task_id: str
    regressed: bool
    missing_markers: List[str]
    # True when the compressed output has MORE tokens than the raw baseline
    # -- a real expansion, not a compression.
    token_count_regressed: bool
    raw_tokens: int
    compressed_tokens: int


@dataclass(frozen=True)
class Tt03Result:
    category: str
    pass_: bool
    regressed_count: int
    task_corpus_size: int
    per_task: List[Tt03TaskResult] = field(default_factory=list)


def run_tt03(
    adapter: ProxyAdapter, tasks: List[Task], on_progress: Optional[ProgressCallback] = None
) -> Tt03Result:
    """
    TT03 Never-Worse Output Guard -- checks two independent ways a proxy's
    compressed output can be worse than the raw input:

    1. Content loss: does compression drop content the task's fixture
       marks as required to survive (task.quality_markers). A task with no
       quality_markers defined skips this half of the check.
    2. Token-count expansion: does "compression" actually make the output
       BIGGER than the raw baseline it started from. This half runs on
       every task regardless of quality_markers, using the same tokenizer
       TT01 uses.

    A task is regressed if either half fails.

    A PASS here means the current task corpus did not detect a regression
    on this run -- it is not a general guarantee, and every terminal/JSON
    report states this limitation.
    """
    per_task: List[Tt03TaskResult] = []

    for i, task in enumerate(tasks):
        markers = task.quality_markers or []
        baseline = adapter.run(task, "baseline")
        compressed = adapter.run(task, "compressed")
        per_task.append(
            evaluate_never_worse_guard(task.id, baseline.raw_output, compressed.raw_output, markers)
        )
        if on_progress:
            on_progress(i + 1, len(tasks))

    regressed_count = sum(1 for t in per_task if t.regressed)

    return Tt03Result(
        category="TT03",
        pass_=regressed_count == 0,
        regressed_count=regressed_count,
        task_corpus_size=len(tasks),
        per_task=per_task,
    )


def evaluate_never_worse_guard(
    task_id: str, raw_output: str, compressed_output: str, required_markers: List[str]
) -> Tt03TaskResult:
    """
    Pure function: given raw baseline text, compressed output text, and the
    markers that must survive, decide PASS/FAIL on both content-loss and
    token-count-expansion grounds.
    """
    missing_markers = [m for m in required_markers if m not in compressed_output]
    raw_tokens = count(raw_output).tokens
    compressed_tokens = count(compressed_output).tokens
    token_count_regressed = compressed_tokens > raw_tokens
    return Tt03TaskResult(
        task_id=task_id,
        regressed=len(missing_markers) > 0 or token_count_regressed,
        missing_markers=missing_markers,
        token_count_regressed=token_count_regressed,
        raw_tokens=raw_tokens,
        compressed_tokens=compressed_tokens,
    )
