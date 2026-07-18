"""
Ported from src/mcp/server.ts. Same dual CLI + MCP-server pattern Semgrep/Trivy/Snyk/
SonarQube ship: one binary, one underlying engine (run_verify()), a thin additional
transport on top. Nothing in this file re-implements verification logic -- it only maps
an MCP tool call's input onto VerifyOptions and its output back onto the same structured
report `tokentrust verify --format json` already produces (report/types.py's FullReport).
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from typing import Any, Callable, Dict, List, Optional

import anyio
import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from ..report.json_report import serialize_report
from ..report.terminal import render_progress
from ..verify import (
    DEFAULT_LIVE_MAX_TASKS_OPTION,
    VerifyDependencies,
    VerifyOptions,
    resolve_default_tasks_path,
    run_verify,
)
from .tool_schema import (
    VERIFY_PROXY_SAVINGS_INPUT_SCHEMA,
    VERIFY_TOOL_DESCRIPTION,
    VERIFY_TOOL_NAME,
    VERIFY_TOOL_TITLE,
    normalize_proxy_input,
)


def _read_package_version() -> str:
    """
    Reads the installed distribution's own declared version -- the Python-native
    equivalent of src/mcp/server.ts's readPackageVersion(), which reads package.json
    relative to the built file (npm always ships package.json inside every published
    tarball, regardless of the "files" allowlist). A Python wheel does NOT ship
    pyproject.toml inside the installed package, so the correct equivalent is
    importlib.metadata reading the installed .dist-info that pip always creates --
    including for an editable `pip install -e ".[dev]"` install (PEP 660).
    """
    try:
        return version("tokentrust-cli")
    except PackageNotFoundError:  # pragma: no cover -- only hit running from an uninstalled checkout
        return "0.0.0-dev"


PACKAGE_VERSION = _read_package_version()


@dataclass
class McpServerDependencies(VerifyDependencies):
    """VerifyDependencies plus an overridable cwd(), for tests; defaults to os.getcwd at call time,
    matching the CLI's --repo default."""

    cwd: Optional[Callable[[], str]] = None


def create_tokentrust_mcp_server(deps: Optional[McpServerDependencies] = None) -> Server:
    """
    Builds the MCP server WITHOUT connecting a transport, so tests can attach an
    in-memory session pair instead of the real stdio one (real stdio would bind to
    this process's actual stdin/stdout).
    """
    deps = deps or McpServerDependencies()
    cwd = deps.cwd or os.getcwd

    # Stdio is the MCP transport's actual wire protocol here -- every byte written to
    # stdout by a connected transport IS a JSON-RPC message. run_verify()'s defaults
    # write BOTH the trace/report (via its print_fn dependency, the builtin print(),
    # which writes to stdout) and the per-task progress ticker (via
    # report/terminal.py's print_progress(), which writes directly to sys.stdout and
    # is NOT routed through print_fn at all) straight to stdout. Either one would
    # corrupt the JSON-RPC stream, so both are rerouted to stderr here unless a caller
    # (a test) supplies its own. This is the exact bug the npm package's MCP server
    # caught and fixed (see CHANGELOG.md's [0.3.0] entry) -- routed to stderr from the
    # start on the Python port rather than repeating it.
    def _stderr_print(line: str) -> None:
        sys.stderr.write(f"{line}\n")

    def _stderr_progress(done: int, total: int) -> None:
        sys.stderr.write(f"{render_progress(done, total)}\n")

    verify_deps = VerifyDependencies(
        get_adapter=deps.get_adapter,
        now=deps.now,
        live_api_client=deps.live_api_client,
        store_path=deps.store_path,
        print_fn=deps.print_fn or _stderr_print,
        env=deps.env,
        report_out_path=deps.report_out_path,
        print_progress=deps.print_progress or _stderr_progress,
    )

    server: Server = Server(name="tokentrust-cli", version=PACKAGE_VERSION)

    @server.list_tools()
    async def _list_tools() -> List[types.Tool]:
        return [
            types.Tool(
                name=VERIFY_TOOL_NAME,
                title=VERIFY_TOOL_TITLE,
                description=VERIFY_TOOL_DESCRIPTION,
                inputSchema=VERIFY_PROXY_SAVINGS_INPUT_SCHEMA,
            )
        ]

    @server.call_tool()
    async def _call_tool(name: str, arguments: Dict[str, Any]) -> types.CallToolResult:
        if name != VERIFY_TOOL_NAME:
            raise ValueError(f"Unknown tool: {name}")

        # The low-level Server validates `arguments` against VERIFY_PROXY_SAVINGS_INPUT_SCHEMA
        # BEFORE this handler ever runs (server.call_tool()'s default validate_input=True), so
        # "proxy" is guaranteed present here and every field already matches its declared type.
        repo = arguments.get("repo")
        if repo is None:
            repo = cwd()
        tasks_path = arguments.get("tasks")
        if tasks_path is None:
            tasks_path = resolve_default_tasks_path()

        options = VerifyOptions(
            proxies=normalize_proxy_input(arguments["proxy"]),
            repo=repo,
            tasks_path=tasks_path,
            live=arguments.get("live", False),
            confirm_cost=arguments.get("confirmCost", False),
            live_max_tasks=arguments.get("liveMaxTasks", DEFAULT_LIVE_MAX_TASKS_OPTION),
            # Always structured JSON: an MCP tool call is a machine-facing surface, never
            # the human terminal one --format terminal renders.
            format="json",
        )

        # run_verify() is synchronous (subprocess.run, blocking file/network I/O) -- calling
        # it directly on this coroutine would block the whole anyio event loop for the
        # duration of a proxy run. Offloaded to a worker thread instead.
        outcome = await anyio.to_thread.run_sync(run_verify, options, verify_deps)

        if outcome.report is not None:
            response_text = serialize_report(outcome.report)
        else:
            response_text = json.dumps(
                {
                    "ok": False,
                    "exit_code": outcome.exit_code,
                    "message": (
                        "Verification did not produce a report -- see the tool result text for the "
                        "reason (e.g. a missing proxy binary, an invalid task corpus, or the --live "
                        "safety gate refusing the call)."
                    ),
                },
                indent=2,
            )

        return types.CallToolResult(
            content=[types.TextContent(type="text", text=response_text)],
            isError=outcome.exit_code != 0,
        )

    return server


async def start_mcp_server(deps: Optional[McpServerDependencies] = None) -> Server:
    """Starts the real stdio MCP server. This is what `tokentrust mcp` runs."""
    server = create_tokentrust_mcp_server(deps)
    async with stdio_server() as (read_stream, write_stream):
        # Blocks serving tool calls until the client disconnects (EOF on stdin) -- the
        # standard MCP Python SDK stdio lifecycle. Unlike the npm package's
        # server.connect(transport), which resolves once listening and lets Node's open
        # stdin handle keep the process alive, Server.run() IS the serve loop itself.
        await server.run(read_stream, write_stream, server.create_initialization_options())
    return server
