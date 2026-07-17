"""Ported from src/report/types.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..adapters.types import ProxyName

CategoryId = str  # 'TT01' | 'TT02' | 'TT03' | 'TT04' | 'TT05'


@dataclass(frozen=True)
class ReportRecord:
    """
    Structured, versioned measurement record. Every benchmark run, even in
    the free CLI, produces this record so a `prior_run_id` chain can exist
    from day one.
    """

    run_id: str
    timestamp: str
    proxy: ProxyName
    proxy_version: str
    repo: str
    category: CategoryId
    claimed_savings_pct: Optional[float]
    measured_savings_pct: float
    task_corpus_size: int
    prior_run_id: Optional[str]


@dataclass(frozen=True)
class Tt03ReportEntry:
    pass_: bool
    regressed_count: int
    task_corpus_size: int


@dataclass(frozen=True)
class Tt05ReportEntry:
    pass_: bool
    message: str
    prior_run_id: Optional[str]
    degraded: bool


@dataclass
class FullReport:
    run_id: str
    timestamp: str
    repo: str
    task_corpus_size: int
    proxies: List[ProxyName]
    # TT01/TT02/TT04 records, matching the ReportRecord shape above.
    records: List[ReportRecord] = field(default_factory=list)
    # TT03 doesn't fit the "measured_savings_pct" record shape -- a guard, not a savings metric.
    tt03: Dict[str, Tt03ReportEntry] = field(default_factory=dict)
    tt05: Dict[str, Tt05ReportEntry] = field(default_factory=dict)
