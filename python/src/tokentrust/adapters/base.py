"""Ported from src/adapters/base.ts."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import List, Optional

from ..tasks.loader import load_fixture_context
from ..tasks.types import Task
from .spawn_utils import is_enoent, spawn_capture
from .types import AdapterResult, MissingBinaryError, ProxyAdapter, ProxyExecutionError, ProxyName, RunMode

_VERSION_PATTERN = re.compile(r"(\d+\.\d+\.\d+)")


@dataclass(frozen=True)
class CompressInvocation:
    args: List[str]
    input: Optional[str] = None


class BaseAdapter(ProxyAdapter):
    """
    Shared implementation for the two ProxyAdapter implementations. Each
    concrete adapter only supplies its binary name, install command, and
    the CLI args to invoke for --version / compression -- all
    process-spawning, caching, and error-handling behavior lives here once.
    """

    version_args: List[str] = []
    compress_args: List[str] = []

    def __init__(self) -> None:
        self._cached_version: Optional[str] = None

    def is_installed(self) -> bool:
        try:
            spawn_capture(self.binary_name, self.version_args)
            return True
        except OSError:
            # Any spawn failure (ENOENT or otherwise) means the binary is
            # not usable from this environment.
            return False

    def get_version(self) -> str:
        if self._cached_version:
            return self._cached_version
        try:
            result = spawn_capture(self.binary_name, self.version_args)
            text = (result.stdout or result.stderr).strip()
            match = _VERSION_PATTERN.search(text)
            self._cached_version = match.group(1) if match else "unknown"
        except OSError as err:
            self._cached_version = "not-installed" if is_enoent(err) else "unknown"
        return self._cached_version

    def _build_compress_invocation(self, task: Task, context: str) -> CompressInvocation:
        """
        Builds the actual CLI invocation for the compress step. Defaults to
        the adapter's fixed compress_args over stdin (headroom). rtk
        overrides this -- its real CLI has no single fixed args array.
        """
        return CompressInvocation(args=self.compress_args, input=context)

    def run(self, task: Task, mode: RunMode) -> AdapterResult:
        start = time.monotonic()
        context = load_fixture_context(task)

        if mode == "baseline":
            proxy_version = self.get_version()
            duration_ms = int((time.monotonic() - start) * 1000)
            return AdapterResult(raw_output=context, proxy_version=proxy_version, duration_ms=duration_ms)

        if not self.is_installed():
            raise MissingBinaryError(self.name, self.binary_name, self.install_command)

        invocation = self._build_compress_invocation(task, context)
        result = spawn_capture(self.binary_name, invocation.args, invocation.input)
        if result.code != 0:
            # Do not treat a failed invocation's stdout (empty, partial, or
            # an error message) as valid compressed output.
            raise ProxyExecutionError(
                self.name, self.binary_name, invocation.args, result.code, result.stderr
            )
        proxy_version = self.get_version()
        duration_ms = int((time.monotonic() - start) * 1000)
        return AdapterResult(raw_output=result.stdout, proxy_version=proxy_version, duration_ms=duration_ms)
