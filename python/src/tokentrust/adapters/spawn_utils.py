"""
Shared subprocess wrapper used by every proxy adapter. Python's stdlib
`subprocess` is deliberately the only process-spawning mechanism used here,
mirroring the TS port's choice of Node's built-in `child_process.spawn`
over a third-party process wrapper -- two adapters don't justify one.

Ported from src/adapters/spawn-utils.ts.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class SpawnCaptureResult:
    stdout: str
    stderr: str
    code: Optional[int]


def spawn_capture(binary: str, args: List[str], input_text: Optional[str] = None) -> SpawnCaptureResult:
    """
    Runs `binary args...`, feeding `input_text` on stdin when given, and
    capturing stdout/stderr as text. Raises `FileNotFoundError` when the
    binary isn't on PATH (the Python equivalent of Node's ENOENT spawn
    error) so callers can distinguish "not installed" from "ran and
    failed" -- see `is_enoent()`.
    """
    completed = subprocess.run(
        [binary, *args],
        input=input_text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return SpawnCaptureResult(stdout=completed.stdout, stderr=completed.stderr, code=completed.returncode)


def is_enoent(err: BaseException) -> bool:
    return isinstance(err, FileNotFoundError)
