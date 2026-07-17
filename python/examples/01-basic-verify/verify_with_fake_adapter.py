#!/usr/bin/env python3
"""
Example 1: basic verify run against the bundled 23-task corpus.

Uses a fake in-process adapter (via VerifyDependencies.get_adapter) instead
of a real `rtk` binary so this example runs anywhere Python and
tokentrust-cli are installed. Swap `fake_get_adapter` for
`tokentrust.adapters.registry.get_adapter` (the default) to run against a
real, installed `rtk` binary instead.

Run:
    python verify_with_fake_adapter.py
"""

from __future__ import annotations

import tempfile

from tokentrust.adapters.types import AdapterResult, ProxyAdapter
from tokentrust.verify import VerifyDependencies, VerifyOptions, resolve_default_tasks_path, run_verify


class DemoAdapter(ProxyAdapter):
    """
    A minimal, deterministic stand-in for a real proxy: "compression"
    here just means "keep the first third of the text", which is enough
    to exercise TT01's real token-counting logic without a real `rtk`
    binary on PATH.
    """

    name = "rtk"
    binary_name = "rtk"
    install_command = "curl -fsSL https://rtk-ai.app/install.sh | sh"

    def is_installed(self) -> bool:
        return True

    def get_version(self) -> str:
        return "demo-0.0.0"

    def run(self, task, mode: str) -> AdapterResult:
        from tokentrust.tasks.loader import load_fixture_context

        context = load_fixture_context(task)
        if mode == "baseline":
            return AdapterResult(raw_output=context, proxy_version=self.get_version(), duration_ms=1)
        third = max(1, len(context) // 3)
        return AdapterResult(raw_output=context[:third], proxy_version=self.get_version(), duration_ms=1)


def main() -> None:
    with tempfile.TemporaryDirectory() as repo_dir:
        options = VerifyOptions(
            proxies=["rtk"],
            repo=repo_dir,
            tasks_path=resolve_default_tasks_path(),
            live=False,
            confirm_cost=False,
            live_max_tasks=5,
            format="terminal",
        )
        deps = VerifyDependencies(get_adapter=lambda name: DemoAdapter())
        outcome = run_verify(options, deps)
        print(f"\nExit code: {outcome.exit_code}")
        print(f"Report written to: {outcome.report_path}")


if __name__ == "__main__":
    main()
