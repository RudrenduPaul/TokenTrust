#!/usr/bin/env python3
"""
Example 2: run verification with format="json", then gate a CI step on the
structured report -- the same TT05 (version-drift) check the bundled
`action/action.yml` GitHub Action performs on the npm side, expressed
directly against the Python library's report object.

Run:
    python ci_gate.py
Exit code is 1 if TT05 detected a regression for any verified proxy, 0
otherwise -- wire this directly into a CI job's exit-code check.
"""

from __future__ import annotations

import sys
import tempfile

from tokentrust.adapters.types import AdapterResult, ProxyAdapter
from tokentrust.tasks.loader import load_fixture_context
from tokentrust.verify import VerifyDependencies, VerifyOptions, resolve_default_tasks_path, run_verify


class DemoAdapter(ProxyAdapter):
    name = "rtk"
    binary_name = "rtk"
    install_command = "curl -fsSL https://rtk-ai.app/install.sh | sh"

    def is_installed(self) -> bool:
        return True

    def get_version(self) -> str:
        return "demo-0.0.0"

    def run(self, task, mode: str) -> AdapterResult:
        context = load_fixture_context(task)
        if mode == "baseline":
            return AdapterResult(raw_output=context, proxy_version=self.get_version(), duration_ms=1)
        half = max(1, len(context) // 2)
        return AdapterResult(raw_output=context[:half], proxy_version=self.get_version(), duration_ms=1)


def main() -> int:
    with tempfile.TemporaryDirectory() as repo_dir:
        options = VerifyOptions(
            proxies=["rtk"],
            repo=repo_dir,
            tasks_path=resolve_default_tasks_path(),
            live=False,
            confirm_cost=False,
            live_max_tasks=5,
            format="json",
        )
        deps = VerifyDependencies(get_adapter=lambda name: DemoAdapter(), print_fn=lambda line: None)
        outcome = run_verify(options, deps)

        if outcome.exit_code != 0 or outcome.report is None:
            print("::error::tokentrust verify failed", file=sys.stderr)
            return 1

        tt05_entries = outcome.report.tt05
        all_pass = all(entry.pass_ for entry in tt05_entries.values()) if tt05_entries else True

        for proxy, entry in tt05_entries.items():
            status = "PASS" if entry.pass_ else "FAIL"
            print(f"[{status}] TT05 for {proxy}: {entry.message}")

        if not all_pass:
            print("::error::TokenTrust TT05 detected a version-drift regression.", file=sys.stderr)
            return 1

        print("TT05 gate: no regression detected.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
