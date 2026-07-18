"""
Direct coverage of spawn_capture: timeout/kill behavior and env-var
scrubbing. Ported alongside the equivalent tests in
src/adapters/spawn-utils.test.ts.
"""

from __future__ import annotations

import os
import subprocess
import sys

import pytest

from tokentrust.adapters.spawn_utils import spawn_capture


def test_captures_stdout_from_a_real_child_process():
    result = spawn_capture(sys.executable, ["-c", "import sys; sys.stdout.write('hello')"])
    assert result.stdout == "hello"
    assert result.code == 0


def test_raises_file_not_found_for_a_missing_binary():
    with pytest.raises(FileNotFoundError):
        spawn_capture("tokentrust-definitely-not-a-real-binary", [])


def test_captures_a_non_zero_exit_code_without_raising():
    result = spawn_capture(sys.executable, ["-c", "import sys; sys.exit(3)"])
    assert result.code == 3


def test_kills_a_hung_child_and_raises_timeout_expired():
    with pytest.raises(subprocess.TimeoutExpired):
        spawn_capture(sys.executable, ["-c", "import time; time.sleep(10)"], timeout_seconds=0.2)


def test_does_not_pass_sensitive_env_vars_through_to_the_child_process():
    os.environ["TOKENTRUST_TEST_SECRET_TOKEN"] = "super-secret-value"
    try:
        result = spawn_capture(
            sys.executable,
            ["-c", "import os; print('TOKENTRUST_TEST_SECRET_TOKEN' in os.environ, end='')"],
        )
        assert result.stdout == "False"
    finally:
        del os.environ["TOKENTRUST_TEST_SECRET_TOKEN"]


def test_still_passes_path_through_to_the_child_process():
    result = spawn_capture(
        sys.executable,
        ["-c", "import os; print('PATH' in os.environ, end='')"],
    )
    assert result.stdout == "True"
