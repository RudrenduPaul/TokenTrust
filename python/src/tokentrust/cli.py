#!/usr/bin/env python3
"""
Ported from src/cli.ts. Console entry point: `tokentrust verify [options]`,
installed via the `tokentrust` console-script defined in
python/pyproject.toml -- same command name as the npm package's bin entry,
so the two distributions are drop-in interchangeable on PATH.
"""

from __future__ import annotations

import os
import sys
from typing import List, Optional

from .adapters.registry import SUPPORTED_PROXIES, is_supported_proxy
from .adapters.types import ProxyName
from .verify import (
    DEFAULT_LIVE_MAX_TASKS_OPTION,
    CliUsageError,
    VerifyOptions,
    resolve_default_tasks_path,
    run_verify,
)

# Recognized before (and alongside) argparse's strict parsing so that
# `tokentrust --help` / `tokentrust verify --help` print clean usage text
# and exit 0.
_HELP_FLAGS = {"--help", "-h"}


def print_top_level_usage(print_fn=print) -> None:
    print_fn(
        "\n".join(
            [
                "tokentrust -- vendor-neutral verification for AI-coding-agent context-reduction proxies",
                "",
                "Usage:",
                "  tokentrust verify --proxy <name> [options]",
                "",
                "Commands:",
                "  verify    Measure a proxy's actual token/cost savings against a labeled task corpus",
                "            and compare the measurement to the proxy's claimed savings.",
                "",
                'Run "tokentrust verify --help" for the full verify flag list.',
                "",
                "Example:",
                "  tokentrust verify --proxy rtk",
            ]
        )
    )


def print_verify_usage(print_fn=print) -> None:
    print_fn(
        "\n".join(
            [
                "tokentrust verify -- measure and verify a proxy's claimed token/cost savings",
                "",
                "Usage:",
                "  tokentrust verify --proxy <name> [options]",
                "",
                "Flags:",
                "  --proxy <name>            Proxy to verify (repeatable). Supported: rtk, headroom. Required.",
                "  --repo <path>             Repo to measure against (default: current directory)",
                "  --tasks <file>            Task corpus YAML file (default: bundled 23-task corpus)",
                "  --live                    Sample real provider-billed tokens for the first proxy (requires --confirm-cost)",
                "  --confirm-cost            Confirm the estimated spend --live prints before any API call is made",
                "  --live-max-tasks <n>      Max tasks sampled in --live mode (default: 5)",
                "  --format <terminal|json>  Report output format (default: terminal)",
                "  -h, --help                Show this help message and exit",
                "",
                "Proxy support (v0.1):",
                "  rtk        Fully supported -- real subprocess-based verification.",
                "  headroom   Recognized, not yet supported -- headroom is an HTTP proxy server, not a",
                "             one-shot compression CLI; verify prints a message and skips it.",
                "",
                "Example:",
                "  tokentrust verify --proxy rtk",
            ]
        )
    )


class RawCliFlags:
    def __init__(
        self,
        proxy: List[str],
        repo: Optional[str],
        tasks: Optional[str],
        live: bool,
        confirm_cost: bool,
        live_max_tasks: Optional[str],
        format: str,
    ) -> None:
        self.proxy = proxy
        self.repo = repo
        self.tasks = tasks
        self.live = live
        self.confirm_cost = confirm_cost
        self.live_max_tasks = live_max_tasks
        self.format = format


def parse_cli_flags(argv: List[str]) -> RawCliFlags:
    """
    Hand-rolled flag parser (mirrors the TS port's use of node:util's
    parseArgs rather than a CLI-framework dependency): `--proxy` is
    repeatable, everything else is a single string/boolean flag.
    """
    proxy: List[str] = []
    repo: Optional[str] = None
    tasks: Optional[str] = None
    live = False
    confirm_cost = False
    live_max_tasks: Optional[str] = None
    fmt = "terminal"

    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--proxy":
            i += 1
            if i >= len(argv):
                raise CliUsageError("--proxy requires a value.")
            proxy.append(argv[i])
        elif arg == "--repo":
            i += 1
            if i >= len(argv):
                raise CliUsageError("--repo requires a value.")
            repo = argv[i]
        elif arg == "--tasks":
            i += 1
            if i >= len(argv):
                raise CliUsageError("--tasks requires a value.")
            tasks = argv[i]
        elif arg == "--live":
            live = True
        elif arg == "--confirm-cost":
            confirm_cost = True
        elif arg == "--live-max-tasks":
            i += 1
            if i >= len(argv):
                raise CliUsageError("--live-max-tasks requires a value.")
            live_max_tasks = argv[i]
        elif arg == "--format":
            i += 1
            if i >= len(argv):
                raise CliUsageError("--format requires a value.")
            fmt = argv[i]
        elif arg in _HELP_FLAGS:
            pass  # handled by caller before parse_cli_flags is reached for subcommand help
        else:
            raise CliUsageError(f'Unknown flag "{arg}".')
        i += 1

    return RawCliFlags(
        proxy=proxy, repo=repo, tasks=tasks, live=live, confirm_cost=confirm_cost,
        live_max_tasks=live_max_tasks, format=fmt,
    )


def resolve_verify_options(flags: RawCliFlags, cwd: str) -> VerifyOptions:
    """Resolves raw, validated flags into the typed options run_verify() expects."""
    if len(flags.proxy) == 0:
        raise CliUsageError(
            f"--proxy is required (repeatable). Supported proxies: {', '.join(SUPPORTED_PROXIES)}.\n"
            "Usage: tokentrust verify --proxy <name> [--repo <path>] [--tasks <file>] [--live] "
            "[--confirm-cost] [--live-max-tasks N] [--format terminal|json]"
        )

    proxies: List[ProxyName] = []
    for name in flags.proxy:
        if not is_supported_proxy(name):
            raise CliUsageError(f'Unknown proxy "{name}". Supported proxies: {", ".join(SUPPORTED_PROXIES)}.')
        proxies.append(name)

    live_max_tasks = DEFAULT_LIVE_MAX_TASKS_OPTION
    if flags.live_max_tasks is not None:
        try:
            parsed = int(flags.live_max_tasks)
        except ValueError:
            parsed = None
        if parsed is None or parsed <= 0:
            raise CliUsageError(f'--live-max-tasks must be a positive integer, got "{flags.live_max_tasks}".')
        live_max_tasks = parsed

    if flags.format not in ("terminal", "json"):
        raise CliUsageError(f'--format must be "terminal" or "json", got "{flags.format}".')

    return VerifyOptions(
        proxies=proxies,
        repo=flags.repo if flags.repo is not None else cwd,
        tasks_path=flags.tasks if flags.tasks is not None else resolve_default_tasks_path(),
        live=flags.live,
        confirm_cost=flags.confirm_cost,
        live_max_tasks=live_max_tasks,
        format=flags.format,
    )


def main(argv: Optional[List[str]] = None) -> int:
    argv = sys.argv[1:] if argv is None else argv

    if len(argv) > 0 and argv[0] in _HELP_FLAGS:
        print_top_level_usage()
        return 0

    subcommand = argv[0] if len(argv) > 0 else None
    rest = argv[1:]

    if subcommand != "verify":
        sys.stderr.write(f'Unknown command "{subcommand or ""}". Usage: tokentrust verify --proxy <name> [options]\n')
        return 1

    if any(a in _HELP_FLAGS for a in rest):
        print_verify_usage()
        return 0

    try:
        flags = parse_cli_flags(rest)
        options = resolve_verify_options(flags, os.getcwd())
    except CliUsageError as err:
        sys.stderr.write(f"{err}\n")
        return 1

    outcome = run_verify(options)
    return outcome.exit_code


if __name__ == "__main__":
    sys.exit(main())
