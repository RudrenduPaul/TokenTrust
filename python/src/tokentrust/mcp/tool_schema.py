"""Ported from src/mcp/tool-schema.ts."""

from __future__ import annotations

from typing import Any, Dict, List, Union

from ..adapters.registry import SUPPORTED_PROXIES
from ..adapters.types import ProxyName
from ..verify import DEFAULT_LIVE_MAX_TASKS_OPTION

# Name of the single MCP tool this package exposes. Kept as a named constant (not
# inlined) so the server module and its tests can never drift on the string an MCP
# client actually has to call. Matches the npm package's src/mcp/tool-schema.ts.
VERIFY_TOOL_NAME = "verify_proxy_savings"

VERIFY_TOOL_TITLE = "Verify proxy token/cost savings"

VERIFY_TOOL_DESCRIPTION = (
    "Independently verifies an AI-coding-agent context-reduction proxy's (rtk, headroom) claimed "
    "token/cost savings against a real, labeled task corpus and a local tokenizer -- the same engine "
    "`tokentrust verify` uses on the command line. Returns the structured JSON report (claimed vs. "
    "measured savings, TT01-TT05 category results) so an agent can compare the two numbers directly "
    "instead of trusting the proxy's own claim. No live, provider-billed API calls are made unless "
    "both `live` and `confirmCost` are set to true in the same call."
)

# Raw JSON Schema for the tool's `inputSchema`, handed straight to mcp.types.Tool(inputSchema=...).
# Field names are deliberately camelCase (confirmCost, liveMaxTasks) even though the rest of this
# Python port uses snake_case -- this is the tool's WIRE contract, and it must match the npm
# package's verify_proxy_savings tool (src/mcp/tool-schema.ts) exactly, since a real MCP client
# calling either language's server should see an identical tool. mcp/server.py translates a parsed
# call's camelCase arguments into the snake_case VerifyOptions fields internally.
#
# Mirrors cli.py's `verify` flags one-for-one, MINUS `--format`: an MCP tool call is always
# machine-facing, so this tool always returns the structured JSON report and never exposes a
# format choice.
VERIFY_PROXY_SAVINGS_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "proxy": {
            "anyOf": [
                {"type": "string", "enum": list(SUPPORTED_PROXIES)},
                {
                    "type": "array",
                    "items": {"type": "string", "enum": list(SUPPORTED_PROXIES)},
                    "minItems": 1,
                },
            ],
            "description": (
                'Proxy name to verify. Pass a single name (e.g. "rtk") or an array of names to run '
                "the TT04 cross-tool comparison across all of them in one call -- mirrors the CLI's "
                f"repeatable --proxy flag. Supported: {', '.join(SUPPORTED_PROXIES)}."
            ),
        },
        "repo": {
            "type": "string",
            "description": (
                "Filesystem path to the repo to measure against. Defaults to the MCP server "
                "process's current working directory, same as the CLI's --repo default."
            ),
        },
        "tasks": {
            "type": "string",
            "description": (
                "Path to a task corpus YAML file. Defaults to the bundled task corpus shipped with "
                "the package, same as the CLI's --tasks default."
            ),
        },
        "live": {
            "type": "boolean",
            "description": (
                "Sample real, provider-billed tokens for the first proxy instead of estimating from "
                "local pricing tables. Requires confirmCost=true in the SAME call, exactly like the "
                "CLI's --live/--confirm-cost safety gate -- setting only one of the two makes zero "
                "API calls and reports the refusal instead. Defaults to false."
            ),
        },
        "confirmCost": {
            "type": "boolean",
            "description": (
                "Confirms the estimated spend `live` mode would print before any real, billed API "
                "call is made. Defaults to false. Has no effect unless `live` is also true."
            ),
        },
        "liveMaxTasks": {
            "type": "integer",
            "exclusiveMinimum": 0,
            "description": f"Max tasks sampled in live mode. Defaults to {DEFAULT_LIVE_MAX_TASKS_OPTION}.",
        },
    },
    "required": ["proxy"],
}


def normalize_proxy_input(proxy: Union[ProxyName, List[ProxyName]]) -> List[ProxyName]:
    """Normalizes the tool's `proxy` field (single name or array) into the list run_verify() expects."""
    if isinstance(proxy, list):
        return proxy
    return [proxy]
