"""Ported from src/categories/claims.ts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from ..adapters.types import ProxyName


@dataclass(frozen=True)
class ClaimedSavings:
    # The percentage figure itself, or None when no sourced figure is on file yet.
    pct: Optional[float]
    # Human-readable label shown in reports -- always states the source, never presented as this tool's own finding.
    label: str


# Claimed compression/savings figures, sourced from each proxy's own public
# README at the time this file was last updated -- never this tool's own
# finding. `rtk`'s figure ("up to 70% context reduction") is the one stated
# in its own README. `headroom` has no sourced figure captured yet.
CLAIMED_SAVINGS: Dict[str, ClaimedSavings] = {
    "rtk": ClaimedSavings(pct=70, label="up to 70% context reduction (rtk README)"),
    "headroom": ClaimedSavings(pct=None, label="no claimed figure on file"),
}


def get_claimed_savings(proxy: ProxyName) -> ClaimedSavings:
    return CLAIMED_SAVINGS[proxy]
