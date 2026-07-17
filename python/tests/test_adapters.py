"""Adapter registry + BaseAdapter tests. Ported in spirit from src/adapters/*.test.ts."""

from __future__ import annotations

import pytest

from tokentrust.adapters.headroom import HeadroomAdapter
from tokentrust.adapters.registry import SUPPORTED_PROXIES, get_adapter, is_supported_proxy
from tokentrust.adapters.rtk import RtkAdapter
from tokentrust.adapters.types import MissingBinaryError, ProxyExecutionError

from .conftest import make_task


def test_lists_exactly_the_2_locked_v01_proxies():
    assert SUPPORTED_PROXIES == ["rtk", "headroom"]


def test_is_supported_proxy_accepts_known_rejects_unknown():
    assert is_supported_proxy("rtk") is True
    assert is_supported_proxy("headroom") is True
    assert is_supported_proxy("context-mode") is False
    assert is_supported_proxy("made-up-proxy") is False


def test_get_adapter_returns_right_concrete_instance():
    assert isinstance(get_adapter("rtk"), RtkAdapter)
    assert isinstance(get_adapter("headroom"), HeadroomAdapter)


def test_get_adapter_returns_fresh_instance_every_call():
    assert get_adapter("rtk") is not get_adapter("rtk")


def test_get_adapter_raises_for_unknown_proxy():
    with pytest.raises(ValueError, match="Unknown proxy"):
        get_adapter("not-a-real-proxy")


def test_rtk_adapter_not_installed_reports_false_when_binary_missing():
    adapter = RtkAdapter()
    adapter.binary_name = "definitely-not-a-real-binary-xyz"
    assert adapter.is_installed() is False


def test_rtk_build_compress_invocation_uses_pipe_filter_for_filter_tasks():
    adapter = RtkAdapter()
    task = make_task(filter="git-log")
    invocation = adapter._build_compress_invocation(task, "some context")
    assert invocation.args == ["pipe", "--filter", "git-log"]
    assert invocation.input == "some context"


def test_missing_binary_error_message_format():
    err = MissingBinaryError("rtk", "rtk", "cargo install rtk")
    assert str(err) == "rtk not found on PATH. Install: cargo install rtk. Then re-run this command."


def test_proxy_execution_error_message_includes_exit_code_and_stderr():
    err = ProxyExecutionError("rtk", "rtk", ["read", "-l", "aggressive"], 1, "boom")
    assert "exited with code 1" in str(err)
    assert "stderr: boom" in str(err)


def test_proxy_execution_error_no_stderr_output_label():
    err = ProxyExecutionError("rtk", "rtk", ["read"], 1, "")
    assert "(no stderr output)" in str(err)
