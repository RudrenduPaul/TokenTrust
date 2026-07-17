"""Ported from src/adapters/types.ts."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Optional

if TYPE_CHECKING:
    from ..tasks.types import Task

ProxyName = Literal["rtk", "headroom"]
RunMode = Literal["compressed", "baseline"]


@dataclass(frozen=True)
class AdapterResult:
    # Exact text that would reach the LLM for this task/mode.
    raw_output: str
    # Installed proxy version, used for TT05 version-drift tracking.
    proxy_version: str
    duration_ms: int


class ProxyAdapter(ABC):
    name: ProxyName
    binary_name: str
    # Human-readable install instructions, shown in the missing-binary error.
    install_command: str

    @abstractmethod
    def is_installed(self) -> bool: ...

    @abstractmethod
    def get_version(self) -> str: ...

    @abstractmethod
    def run(self, task: "Task", mode: RunMode) -> AdapterResult: ...


class MissingBinaryError(Exception):
    """
    Locked error message format (user-confirmed verbatim):
    "<proxy> not found on PATH. Install: <install command>. Then re-run this command."
    """

    def __init__(self, proxy_name: ProxyName, binary_name: str, install_command: str) -> None:
        self.proxy_name = proxy_name
        self.binary_name = binary_name
        self.install_command = install_command
        super().__init__(
            f"{binary_name} not found on PATH. Install: {install_command}. Then re-run this command."
        )


class ProxyExecutionError(Exception):
    """
    Raised when a proxy's compress command runs (the binary is on PATH and
    spawns) but exits non-zero. A failed run typically prints nothing or an
    error message to stdout, which the tokenizer then counts as near-zero
    tokens, making TT01 report an implausible ~100% reduction that reads as
    "even better than promised" when it is actually a broken measurement.
    Failing loudly here, instead of silently reporting that fabricated
    number, is required: never state a measured number without the command
    that produced it actually succeeding.
    """

    def __init__(
        self,
        proxy_name: ProxyName,
        binary_name: str,
        args: list,
        exit_code: Optional[int],
        stderr: str,
    ) -> None:
        self.proxy_name = proxy_name
        self.exit_code = exit_code
        code_label = "was terminated by a signal" if exit_code is None else f"exited with code {exit_code}"
        stderr_suffix = f" stderr: {stderr.strip()}" if stderr.strip() else " (no stderr output)"
        super().__init__(
            f"{binary_name} {' '.join(args)} {code_label} instead of compressing successfully."
            f"{stderr_suffix} Refusing to report a compression ratio computed from a failed "
            f"{binary_name} run."
        )
