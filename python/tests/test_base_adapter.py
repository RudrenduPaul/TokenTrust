"""
Exercises BaseAdapter.run()/get_version()/is_installed() against real,
harmless subprocesses (the system `echo` and a deliberately missing
binary) rather than a real proxy -- no rtk/headroom binary is required to
run this suite.
"""

from __future__ import annotations

import os
import shutil
import tempfile

import pytest

from tokentrust.adapters.base import BaseAdapter, CompressInvocation
from tokentrust.adapters.types import MissingBinaryError, ProxyExecutionError

from .conftest import make_task


class EchoAdapter(BaseAdapter):
    name = "rtk"
    binary_name = "echo"
    install_command = "n/a"
    version_args = ["1.2.3"]
    compress_args = ["compressed-output"]


class FailingAdapter(BaseAdapter):
    name = "rtk"
    binary_name = "false"  # exits 1, prints nothing -- present on every POSIX system
    install_command = "n/a"
    version_args = []
    compress_args = []


class MissingBinaryAdapter(BaseAdapter):
    name = "rtk"
    binary_name = "definitely-not-a-real-binary-xyz-123"
    install_command = "n/a"
    version_args = ["--version"]
    compress_args = []


@pytest.fixture()
def fixture_repo():
    d = tempfile.mkdtemp(prefix="tokentrust-base-adapter-")
    with open(os.path.join(d, "a.txt"), "w", encoding="utf-8") as fh:
        fh.write("hello fixture")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def test_is_installed_true_for_real_binary():
    assert EchoAdapter().is_installed() is True


def test_is_installed_false_for_missing_binary():
    assert MissingBinaryAdapter().is_installed() is False


def test_get_version_parses_semver_from_stdout():
    adapter = EchoAdapter()
    assert adapter.get_version() == "1.2.3"


def test_get_version_caches_after_first_call():
    adapter = EchoAdapter()
    first = adapter.get_version()
    adapter.binary_name = "false"  # would now fail if re-invoked
    assert adapter.get_version() == first


def test_get_version_not_installed_for_missing_binary():
    assert MissingBinaryAdapter().get_version() == "not-installed"


def test_baseline_mode_returns_fixture_context_without_spawning_compress(fixture_repo):
    adapter = EchoAdapter()
    task = make_task(fixture_repo_absolute_path=fixture_repo)
    result = adapter.run(task, "baseline")
    assert "hello fixture" in result.raw_output


def test_compressed_mode_raises_missing_binary_error(fixture_repo):
    adapter = MissingBinaryAdapter()
    task = make_task(fixture_repo_absolute_path=fixture_repo)
    with pytest.raises(MissingBinaryError):
        adapter.run(task, "compressed")


def test_compressed_mode_raises_proxy_execution_error_on_nonzero_exit(fixture_repo):
    adapter = FailingAdapter()
    task = make_task(fixture_repo_absolute_path=fixture_repo)
    with pytest.raises(ProxyExecutionError):
        adapter.run(task, "compressed")


def test_compressed_mode_success_returns_stdout_as_raw_output(fixture_repo):
    adapter = EchoAdapter()
    task = make_task(fixture_repo_absolute_path=fixture_repo)
    result = adapter.run(task, "compressed")
    assert "compressed-output" in result.raw_output


def test_default_build_compress_invocation_uses_fixed_compress_args(fixture_repo):
    adapter = EchoAdapter()
    task = make_task(fixture_repo_absolute_path=fixture_repo)
    invocation = adapter._build_compress_invocation(task, "some context")
    assert invocation == CompressInvocation(args=["compressed-output"], input="some context")
