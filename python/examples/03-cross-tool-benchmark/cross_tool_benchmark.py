#!/usr/bin/env python3
"""
Example 3: TT04 Cross-Tool Comparative Benchmark, called directly against
the category module rather than through the CLI. This is what
`tokentrust verify --proxy rtk --proxy headroom` would compute internally
if both proxies were fully supported today (see the honest caveat in
docs/concepts.md: headroom is not yet drivable in v0.1, so this example
constructs its two Tt01Result objects directly instead of going through
run_verify()).

Run:
    python cross_tool_benchmark.py
"""

from __future__ import annotations

from tokentrust.categories.tt01_compression_ratio import Tt01Result, Tt01TaskResult
from tokentrust.categories.tt04_cross_tool_benchmark import run_tt04


def _fake_tt01_result(proxy_reduction_by_task: dict) -> Tt01Result:
    per_task = [
        Tt01TaskResult(
            task_id=task_id, tokens_before=1000, tokens_after=int(1000 * (1 - pct / 100)),
            reduction_pct=pct, skipped=False,
        )
        for task_id, pct in proxy_reduction_by_task.items()
    ]
    measured = sum(t.reduction_pct for t in per_task) / len(per_task)
    return Tt01Result(
        category="TT01", claimed_savings_pct=None, measured_savings_pct=measured,
        per_task=per_task, task_corpus_size=len(per_task),
    )


def main() -> None:
    # Same 3-task corpus measured for two proxies -- run_tt04() requires
    # identical task ids across every proxy compared (see
    # CorpusMismatchError), which is the whole point of a fair
    # side-by-side comparison.
    same_tasks = {"fix-typo-docstring": 62.0, "add-null-check-validator": 55.0, "refactor-split-utils": 71.0}
    rtk_result = _fake_tt01_result(same_tasks)

    same_tasks_headroom = {"fix-typo-docstring": 48.0, "add-null-check-validator": 40.0, "refactor-split-utils": 52.0}
    headroom_result = _fake_tt01_result(same_tasks_headroom)

    tt04 = run_tt04(
        [
            {"proxy": "rtk", "tt01": rtk_result},
            {"proxy": "headroom", "tt01": headroom_result},
        ]
    )

    print(f"TT04 Cross-Tool Comparative Benchmark ({tt04.task_corpus_size}-task corpus)")
    for r in tt04.results:
        print(f"  {r.proxy}: {r.measured_savings_pct:.1f}% measured average reduction")

    best = max(tt04.results, key=lambda r: r.measured_savings_pct)
    print(f"\nHighest-measured performer on this corpus: {best.proxy}")


if __name__ == "__main__":
    main()
