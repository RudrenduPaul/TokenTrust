"""
Shared test doubles. Ported from src/test-support/fake-adapter.ts:
FakeAdapter lets category-level tests control exactly what "baseline" and
"compressed" text a task produces without spawning a real proxy binary.
"""

from __future__ import annotations

import os
from typing import Callable, List

from tokentrust.adapters.types import AdapterResult, ProxyAdapter
from tokentrust.tasks.types import Task


class FakeAdapter(ProxyAdapter):
    install_command = 'echo "fake adapter has no real install command"'

    def __init__(self, name: str, baseline: Callable[[Task], str], compressed: Callable[[Task], str]):
        self.name = name
        self.binary_name = name
        self.installed = True
        self.version = "1.0.0"
        self.call_log: List[dict] = []
        self._baseline = baseline
        self._compressed = compressed

    def is_installed(self) -> bool:
        return self.installed

    def get_version(self) -> str:
        return self.version

    def run(self, task: Task, mode: str) -> AdapterResult:
        self.call_log.append({"taskId": task.id, "mode": mode})
        raw_output = self._baseline(task) if mode == "baseline" else self._compressed(task)
        return AdapterResult(raw_output=raw_output, proxy_version=self.version, duration_ms=1)


def make_task(**overrides) -> Task:
    defaults = dict(
        id="task-1",
        description="a fixture task",
        fixture_repo=".",
        prompt="do the thing",
        difficulty="easy",
        type=None,
        quality_markers=[],
        filter=None,
        fixture_repo_absolute_path=os.getcwd(),
    )
    defaults.update(overrides)
    return Task(**defaults)
