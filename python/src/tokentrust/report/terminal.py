"""Ported from src/report/terminal.ts."""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import List, Optional

from ..adapters.types import ProxyName


def _sanitize_for_terminal(value: str) -> str:
    """
    Strips ANSI escape sequences and other C0/DEL control characters from a
    string before it's interpolated into terminal output. Task ids come
    from a task corpus, which may be downloaded from an untrusted source --
    without this, a crafted id could hide text, spoof a status line, or
    reposition the cursor on the terminal it's printed to.
    """
    return "".join(ch for ch in value if ord(ch) >= 0x20 and ord(ch) != 0x7F)


def render_progress(done: int, total: int) -> str:
    """
    Locked progress-indicator format: a silent 30-45s pause during
    measurement reads as a hang against the <2-minute
    time-to-hello-world target, so this must be shown, not optional.
    """
    return f"Measuring... ({done}/{total} tasks)"


def print_progress(done: int, total: int) -> None:
    line = render_progress(done, total)
    if sys.stdout.isatty():
        sys.stdout.write(f"\r{line}")
        if done == total:
            sys.stdout.write("\n")
    else:
        # Non-TTY (CI logs, piped output): one line per update, no \r overwrite.
        sys.stdout.write(f"{line}\n")
    sys.stdout.flush()


@dataclass(frozen=True)
class Tt01Summary:
    claimed_label: str
    measured_savings_pct: float
    task_corpus_size: int
    min_task: dict  # {"id": str, "pct": float}
    max_task: dict


@dataclass(frozen=True)
class Tt02Summary:
    baseline_usd: float
    compressed_usd: float
    savings_pct: float
    savings_usd: float
    claimed_pct: Optional[float]
    task_corpus_size: int
    pricing_model: str
    live_verified: bool = False


@dataclass(frozen=True)
class Tt03Summary:
    pass_: bool
    regressed_count: int
    task_corpus_size: int


@dataclass(frozen=True)
class Tt04Summary:
    results: List[dict]  # [{"proxy": ProxyName, "measured_savings_pct": float}]
    task_corpus_size: int
    primary_proxy: ProxyName


@dataclass(frozen=True)
class Tt05Summary:
    pass_: bool
    message: str


@dataclass(frozen=True)
class TerminalReportInput:
    proxy: ProxyName
    proxy_version: str
    repo: str
    task_corpus_size: int
    report_path: str
    tt01: Optional[Tt01Summary] = None
    tt02: Optional[Tt02Summary] = None
    tt03: Optional[Tt03Summary] = None
    tt04: Optional[Tt04Summary] = None
    tt05: Optional[Tt05Summary] = None


def render_terminal_report(input: TerminalReportInput) -> str:
    lines: List[str] = []
    lines.append("TokenTrust v0.1 -- Token/Context-Reduction Claims Verification")
    lines.append(
        f"Proxy: {input.proxy} {input.proxy_version} | Repo: {input.repo} | "
        f"Task corpus: {input.task_corpus_size} labeled tasks"
    )
    lines.append("")

    if input.tt01:
        t = input.tt01
        lines.append("[MEASURED] TT01 Compression Ratio")
        lines.append(f"  Claimed ({input.proxy} README): {t.claimed_label}")
        lines.append(
            f"  Measured (this repo, this corpus): {t.measured_savings_pct:.1f}% average "
            f"reduction across {t.task_corpus_size} tasks"
        )
        lines.append(
            f"  Range: {t.min_task['pct']:.1f}% (task: \"{_sanitize_for_terminal(t.min_task['id'])}\") to "
            f"{t.max_task['pct']:.1f}% (task: \"{_sanitize_for_terminal(t.max_task['id'])}\")"
        )
        lines.append("")

    if input.tt02:
        t = input.tt02
        lines.append("[MEASURED] TT02 Cost-Savings Delta")
        lines.append(
            f"  Baseline (uncompressed): ${t.baseline_usd:.2f} across {t.task_corpus_size} tasks "
            f"@ {t.pricing_model} pricing"
        )
        lines.append(
            f"  Compressed ({input.proxy}-proxied): ${t.compressed_usd:.2f} across "
            f"{t.task_corpus_size} tasks"
        )
        claimed_label = "no claimed figure on file" if t.claimed_pct is None else f"claimed {t.claimed_pct}% ceiling"
        lines.append(
            f"  Actual savings: {t.savings_pct:.1f}% (${t.savings_usd:.2f}) -- vs. {claimed_label}"
        )
        if t.live_verified:
            lines.append("  Verified against real, provider-billed usage (--live).")
        lines.append("")

    if input.tt03:
        t = input.tt03
        status = "PASS" if t.pass_ else "FAIL"
        lines.append(f"[{status}]  TT03 Never-Worse Output Guard")
        lines.append(
            f"  {t.regressed_count}/{t.task_corpus_size} tasks regressed in task-completion "
            "diff vs. uncompressed baseline"
        )
        lines.append("")

    if input.tt04:
        t = input.tt04
        sorted_results = sorted(t.results, key=lambda r: r["measured_savings_pct"], reverse=True)
        best = sorted_results[0] if sorted_results else None
        is_primary_best = best is not None and best["proxy"] == t.primary_proxy
        status = "PASS" if is_primary_best else "FAIL"
        lines.append(f"[{status}]  TT04 Cross-Tool Comparative Benchmark")
        others = ", ".join(
            f"{r['proxy']}: {r['measured_savings_pct']:.1f}% measured reduction"
            for r in t.results
            if r["proxy"] != t.primary_proxy
        )
        lines.append(f"  Same {t.task_corpus_size}-task corpus, {others}")
        lines.append(
            f"  {t.primary_proxy} is the highest-measured performer on this specific task corpus"
            if is_primary_best
            else f"  {t.primary_proxy} is not the highest-measured performer on this specific task corpus"
        )
        lines.append("")

    if input.tt05:
        t = input.tt05
        status = "PASS" if t.pass_ else "FAIL"
        lines.append(f"[{status}]  TT05 Version-Drift Regression Check")
        lines.append(f"  {t.message}")
        lines.append("")

    if input.tt02:
        claimed_label = (
            "no claimed figure on file"
            if input.tt02.claimed_pct is None
            else f"claimed: up to {input.tt02.claimed_pct}%"
        )
        lines.append(
            f"Summary: {input.tt02.savings_pct:.1f}% measured cost savings ({claimed_label}) -- "
            "see full report"
        )
    lines.append(f"Report: {input.report_path}")
    lines.append("")
    lines.append(
        f"Note: this is a directional measurement across a {input.task_corpus_size}-task corpus, "
        "not a statistically powered claim across all repos and workloads. A TT03 PASS means no "
        "regression was detected on this run, not a guarantee across all possible tasks."
    )

    return "\n".join(lines)
