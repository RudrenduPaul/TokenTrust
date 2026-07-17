"""Ported from src/categories/live-api-client.ts."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from .tt02_cost_delta import LiveApiCall

_ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"
_LIVE_MODEL = "claude-3-5-haiku-latest"


def anthropic_live_api_client(task_id: str, context_text: str, api_key: str) -> LiveApiCall:
    """
    Default --live API client: sends a single minimal message so the
    provider's own response reports real, billed input-token usage for the
    task's context text -- this is the step that verifies the
    local-tokenizer estimate against a real, provider-billed total. Only
    ever invoked after evaluate_live_gate has returned allowed=True -- see
    tt02_cost_delta.py.

    Uses the stdlib `urllib.request` rather than a third-party HTTP client
    -- mirroring the TS port's choice of the platform's built-in `fetch`
    over adding a dependency for a single, opt-in call site.
    """
    body = json.dumps(
        {
            "model": _LIVE_MODEL,
            "max_tokens": 1,
            "messages": [{"role": "user", "content": context_text}],
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        _ANTHROPIC_API_URL,
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
        },
    )

    try:
        with urllib.request.urlopen(request) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        error_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f'--live API call failed for task "{task_id}": {err.code} {error_body}') from err

    billed_input_tokens = (data.get("usage") or {}).get("input_tokens", 0)
    return LiveApiCall(task_id=task_id, billed_input_tokens=billed_input_tokens)
