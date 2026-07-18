"""
Shared subprocess wrapper used by every proxy adapter. Python's stdlib
`subprocess` is deliberately the only process-spawning mechanism used here,
mirroring the TS port's choice of Node's built-in `child_process.spawn`
over a third-party process wrapper -- two adapters don't justify one.

Ported from src/adapters/spawn-utils.ts.
"""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from typing import List, Optional

DEFAULT_TIMEOUT_SECONDS = 60.0

# Env var NAMES matching this are dropped before the child process is
# spawned -- rtk/headroom are third-party binaries this project doesn't
# control, and without this they'd otherwise inherit every secret sitting
# in the parent's environment (NPM_TOKEN, PYPI_TOKEN, GITHUB_TOKEN,
# ANTHROPIC_API_KEY, ...) on every single call, not just --live mode.
_SENSITIVE_ENV_NAME_PATTERN = re.compile(r"token|secret|key|password|passwd|credential", re.IGNORECASE)


def _scrub_env() -> dict:
    return {name: value for name, value in os.environ.items() if not _SENSITIVE_ENV_NAME_PATTERN.search(name)}


@dataclass(frozen=True)
class SpawnCaptureResult:
    stdout: str
    stderr: str
    code: Optional[int]


def spawn_capture(
    binary: str,
    args: List[str],
    input_text: Optional[str] = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> SpawnCaptureResult:
    """
    Runs `binary args...`, feeding `input_text` on stdin when given, and
    capturing stdout/stderr as text. Raises `FileNotFoundError` when the
    binary isn't on PATH (the Python equivalent of Node's ENOENT spawn
    error) so callers can distinguish "not installed" from "ran and
    failed" -- see `is_enoent()`. Kills the child and raises
    `subprocess.TimeoutExpired` if it hasn't exited within
    timeout_seconds, and never hands the child the parent's full
    environment -- see _scrub_env above.
    """
    completed = subprocess.run(
        [binary, *args],
        input=input_text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_seconds,
        env=_scrub_env(),
    )
    return SpawnCaptureResult(stdout=completed.stdout, stderr=completed.stderr, code=completed.returncode)


def is_enoent(err: BaseException) -> bool:
    return isinstance(err, FileNotFoundError)
