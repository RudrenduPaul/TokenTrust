"""
Mocks urllib so this exercises anthropic_live_api_client's request-building
and response-parsing logic without a real network call or a real API key --
consistent with the project's "opt-in, your own key" design: the test
suite itself never needs live credentials.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from tokentrust.categories.live_api_client import anthropic_live_api_client


def _fake_response(body: dict):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(body).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = False
    return mock_resp


def test_returns_billed_input_tokens_from_a_successful_response():
    with patch("tokentrust.categories.live_api_client.urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value = _fake_response({"usage": {"input_tokens": 42}})
        result = anthropic_live_api_client("task-1", "some context text", "fake-api-key")
        assert result.task_id == "task-1"
        assert result.billed_input_tokens == 42

    request = mock_urlopen.call_args[0][0]
    assert request.full_url == "https://api.anthropic.com/v1/messages"
    assert request.get_header("X-api-key") == "fake-api-key"


def test_missing_usage_field_defaults_to_zero_tokens():
    with patch("tokentrust.categories.live_api_client.urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value = _fake_response({})
        result = anthropic_live_api_client("task-1", "context", "fake-api-key")
        assert result.billed_input_tokens == 0


def test_http_error_raises_runtime_error_with_task_id():
    import urllib.error

    with patch("tokentrust.categories.live_api_client.urllib.request.urlopen") as mock_urlopen:
        err = urllib.error.HTTPError(
            url="https://api.anthropic.com/v1/messages", code=401, msg="unauthorized",
            hdrs=None, fp=MagicMock(read=lambda: b"bad key"),
        )
        mock_urlopen.side_effect = err
        with pytest.raises(RuntimeError, match="task-1"):
            anthropic_live_api_client("task-1", "context", "bad-key")
