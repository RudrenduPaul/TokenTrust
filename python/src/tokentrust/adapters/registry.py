"""Ported from src/adapters/registry.ts."""

from __future__ import annotations

from typing import Dict, List

from .headroom import HeadroomAdapter
from .rtk import RtkAdapter
from .types import ProxyAdapter, ProxyName

SUPPORTED_PROXIES: List[ProxyName] = ["rtk", "headroom"]

_FACTORIES: Dict[str, "type"] = {
    "rtk": RtkAdapter,
    "headroom": HeadroomAdapter,
}


def is_supported_proxy(name: str) -> bool:
    return name in SUPPORTED_PROXIES


def get_adapter(name: ProxyName) -> ProxyAdapter:
    factory = _FACTORIES.get(name)
    if factory is None:
        raise ValueError(f'Unknown proxy "{name}". Supported proxies: {", ".join(SUPPORTED_PROXIES)}.')
    return factory()
