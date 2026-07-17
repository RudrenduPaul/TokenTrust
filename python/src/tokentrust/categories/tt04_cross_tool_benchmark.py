"""Ported from src/categories/tt04_cross_tool_benchmark.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from ..adapters.types import ProxyName
from .tt01_compression_ratio import Tt01Result


class CorpusMismatchError(Exception):
    pass


@dataclass(frozen=True)
class Tt04ProxyResult:
    proxy: ProxyName
    measured_savings_pct: float
    task_ids: List[str]


@dataclass(frozen=True)
class Tt04Result:
    category: str
    results: List[Tt04ProxyResult] = field(default_factory=list)
    task_corpus_size: int = 0


def assert_identical_corpora(per_proxy_task_ids: List[dict]) -> None:
    """
    TT04 Cross-Tool Comparative Benchmark -- runs the identical task corpus
    through every supported proxy side by side. A cross-tool comparison is
    only valid if every compared proxy ran the exact same labeled tasks --
    this raises rather than silently comparing non-identical corpora.
    """
    if len(per_proxy_task_ids) < 2:
        return

    first = per_proxy_task_ids[0]
    first_set = set(first["taskIds"])

    for entry in per_proxy_task_ids[1:]:
        entry_set = set(entry["taskIds"])
        identical = entry_set == first_set
        if not identical:
            raise CorpusMismatchError(
                "TT04 cross-tool comparison requires an identical task corpus across all compared "
                f'proxies. "{entry["proxy"]}" ran a different task corpus than "{first["proxy"]}".'
            )


def run_tt04(per_proxy_results: List[dict]) -> Tt04Result:
    """
    `per_proxy_results` is a list of `{"proxy": ProxyName, "tt01": Tt01Result}`
    dicts, pre-filtered by run_verify()'s dispatch loop, which excludes
    'headroom' in v0.1 -- so no headroom-specific handling is needed here.
    """
    per_proxy_task_ids = [
        {"proxy": r["proxy"], "taskIds": [t.task_id for t in r["tt01"].per_task]}
        for r in per_proxy_results
    ]
    assert_identical_corpora(per_proxy_task_ids)

    results = [
        Tt04ProxyResult(
            proxy=r["proxy"],
            measured_savings_pct=r["tt01"].measured_savings_pct,
            task_ids=[t.task_id for t in r["tt01"].per_task],
        )
        for r in per_proxy_results
    ]

    task_corpus_size = per_proxy_results[0]["tt01"].task_corpus_size if per_proxy_results else 0

    return Tt04Result(category="TT04", results=results, task_corpus_size=task_corpus_size)
