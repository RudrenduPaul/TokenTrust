"""
Ported from src/mcp/server.test.ts. Uses the real MCP Python SDK's in-memory transport
(mcp.shared.memory.create_connected_server_and_client_session) to drive an actual
request/response round trip over the SDK's own protocol layer (JSON-RPC framing, jsonschema
input validation, etc.) -- the same mechanism a real stdio-connected agent uses, only the
transport differs. Mirrors the TypeScript suite's use of
InMemoryTransport.createLinkedPair() + a real Client.
"""

from __future__ import annotations

import re
import shutil
import sys
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from os import path
from unittest.mock import patch

import anyio
import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from tokentrust.adapters.types import ProxyName
from tokentrust.mcp.server import (
    PACKAGE_VERSION,
    McpServerDependencies,
    create_tokentrust_mcp_server,
    start_mcp_server,
)
from tokentrust.mcp.tool_schema import VERIFY_TOOL_NAME
from tokentrust.verify import resolve_default_tasks_path

from .conftest import FakeAdapter


@pytest.fixture()
def repo_dir():
    d = tempfile.mkdtemp(prefix="tokentrust-mcp-")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def base_deps(repo_dir: str, printed: list, **overrides) -> McpServerDependencies:
    defaults = dict(
        get_adapter=lambda name: FakeAdapter(
            name, baseline=lambda t: "token " * 50, compressed=lambda t: "token " * 20
        ),
        now=lambda: datetime(2026, 7, 18, 9, 14, 52, tzinfo=timezone.utc),
        print_fn=printed.append,
        store_path=path.join(repo_dir, ".tokentrust", "report-store.json"),
        report_out_path=path.join(repo_dir, "tokentrust-report-2026-07-18.json"),
        env={},
        cwd=lambda: repo_dir,
    )
    defaults.update(overrides)
    return McpServerDependencies(**defaults)


class TestToolDiscovery:
    @pytest.mark.anyio
    async def test_lists_exactly_one_tool_with_the_cli_mirroring_input_schema(self, repo_dir):
        server = create_tokentrust_mcp_server(base_deps(repo_dir, []))
        async with create_connected_server_and_client_session(server) as client:
            result = await client.list_tools()

            assert len(result.tools) == 1
            tool = result.tools[0]
            assert tool.name == VERIFY_TOOL_NAME
            assert tool.description
            properties = tool.inputSchema.get("properties", {})
            for field in ("proxy", "repo", "tasks", "live", "confirmCost", "liveMaxTasks"):
                assert field in properties
            # format is intentionally never exposed -- the MCP surface is always structured JSON.
            assert "format" not in properties

    def test_advertises_the_running_package_version_as_the_server_version(self):
        assert re.match(r"^\d+\.\d+\.\d+$", PACKAGE_VERSION)


class TestDelegationToRunVerify:
    """No duplicated verification logic -- the tool handler calls straight into run_verify()."""

    @pytest.mark.anyio
    async def test_single_proxy_call_returns_the_same_structured_report_shape_as_verify_json(self, repo_dir):
        printed: list = []
        server = create_tokentrust_mcp_server(base_deps(repo_dir, printed))
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool(
                VERIFY_TOOL_NAME, {"proxy": "rtk", "tasks": resolve_default_tasks_path()}
            )

            assert result.isError is False
            assert len(result.content) == 1
            assert result.content[0].type == "text"
            import json

            report = json.loads(result.content[0].text)
            assert report["proxies"] == ["rtk"]
            assert len(report["records"]) > 0
            assert report["run_id"].startswith("tt_")
            assert "rtk" in report["tt03"]
            assert "rtk" in report["tt05"]
            # The default print_fn override (stderr in production) was overridden by the
            # test's own print_fn, proving the tool handler really called into run_verify()
            # and not a reimplementation of it -- run_verify()'s own "Measuring..." trace
            # only exists there.
            assert any("Measuring..." in line for line in printed)

    @pytest.mark.anyio
    async def test_array_of_proxy_names_runs_the_tt04_cross_tool_comparison_path(self, repo_dir):
        calls: list = []

        def get_adapter(name: ProxyName):
            calls.append(name)
            return FakeAdapter(name, baseline=lambda t: "x" * 100, compressed=lambda t: "x" * 60)

        printed: list = []
        server = create_tokentrust_mcp_server(base_deps(repo_dir, printed, get_adapter=get_adapter))
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool(
                VERIFY_TOOL_NAME, {"proxy": ["rtk", "headroom"], "tasks": resolve_default_tasks_path()}
            )

            # headroom is still intercepted by the v0.1 "not yet supported" gate inside
            # run_verify() itself -- proving this handler passes a list straight through
            # rather than only ever calling run_verify with a single proxy.
            assert "headroom" not in calls
            import json

            report = json.loads(result.content[0].text)
            assert report["proxies"] == ["rtk"]

    @pytest.mark.anyio
    async def test_defaults_repo_to_cwd_and_tasks_to_bundled_corpus_when_omitted(self, repo_dir):
        printed: list = []
        server = create_tokentrust_mcp_server(base_deps(repo_dir, printed))
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool(VERIFY_TOOL_NAME, {"proxy": "rtk"})

            import json

            report = json.loads(result.content[0].text)
            assert report["repo"] == repo_dir
            assert report["task_corpus_size"] > 0


class TestLiveConfirmCostSafetyGate:
    """Respected identically to the CLI."""

    @pytest.mark.anyio
    async def test_live_true_without_confirm_cost_makes_zero_live_calls_and_reports_refusal(self, repo_dir):
        live_calls: list = []
        printed: list = []
        server = create_tokentrust_mcp_server(
            base_deps(
                repo_dir,
                printed,
                live_api_client=lambda *a, **k: live_calls.append((a, k)),
                env={"TOKENTRUST_LIVE_API_KEY": "sk-x"},
            )
        )
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool(
                VERIFY_TOOL_NAME, {"proxy": "rtk", "live": True, "tasks": resolve_default_tasks_path()}
            )

            assert result.isError is True
            assert live_calls == []
            assert "did not produce a report" in result.content[0].text

    @pytest.mark.anyio
    async def test_live_false_default_the_live_api_client_is_never_invoked(self, repo_dir):
        live_calls: list = []
        printed: list = []
        server = create_tokentrust_mcp_server(
            base_deps(repo_dir, printed, live_api_client=lambda *a, **k: live_calls.append((a, k)))
        )
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool(
                VERIFY_TOOL_NAME, {"proxy": "rtk", "tasks": resolve_default_tasks_path()}
            )

            assert result.isError is False
            assert live_calls == []


class TestInputSchemaValidation:
    """
    The SDK validates a registered tool's arguments against its inputSchema BEFORE the
    handler runs, and on failure returns a normal CallToolResult (isError=True, an "Input
    validation error" message) rather than a protocol-level rejection -- so these assert on
    the result shape, and (critically) that the handler -- and therefore run_verify()/
    get_adapter() -- was never reached.
    """

    @pytest.mark.anyio
    async def test_rejects_a_call_missing_the_required_proxy_field_before_reaching_run_verify(self, repo_dir):
        calls: list = []

        def get_adapter(name: ProxyName):
            calls.append(name)
            return FakeAdapter(name, baseline=lambda t: "", compressed=lambda t: "")

        printed: list = []
        server = create_tokentrust_mcp_server(base_deps(repo_dir, printed, get_adapter=get_adapter))
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool(VERIFY_TOOL_NAME, {})

            assert result.isError is True
            assert "Input validation error" in result.content[0].text
            assert calls == []

    @pytest.mark.anyio
    async def test_rejects_an_unsupported_proxy_name_before_reaching_run_verify(self, repo_dir):
        calls: list = []

        def get_adapter(name: ProxyName):
            calls.append(name)
            return FakeAdapter(name, baseline=lambda t: "", compressed=lambda t: "")

        printed: list = []
        server = create_tokentrust_mcp_server(base_deps(repo_dir, printed, get_adapter=get_adapter))
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool(VERIFY_TOOL_NAME, {"proxy": "not-a-real-proxy"})

            assert result.isError is True
            assert "Input validation error" in result.content[0].text
            assert calls == []

    @pytest.mark.anyio
    async def test_rejects_a_non_positive_live_max_tasks(self, repo_dir):
        printed: list = []
        server = create_tokentrust_mcp_server(base_deps(repo_dir, printed))
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool(VERIFY_TOOL_NAME, {"proxy": "rtk", "liveMaxTasks": 0})

            assert result.isError is True
            assert "Input validation error" in result.content[0].text

    @pytest.mark.anyio
    async def test_calling_an_unrecognized_tool_name_errors_instead_of_running_verify(self, repo_dir):
        """
        The low-level Server dispatches any tools/call request to this module's single
        handler regardless of name (it only skips schema validation when the name isn't a
        listed tool -- see server.call_tool()'s _get_cached_tool_definition()), so the
        handler's own `name != VERIFY_TOOL_NAME` guard is what actually rejects it.
        """
        printed: list = []
        server = create_tokentrust_mcp_server(base_deps(repo_dir, printed))
        async with create_connected_server_and_client_session(server) as client:
            result = await client.call_tool("not_a_real_tool", {"proxy": "rtk"})

            assert result.isError is True
            assert "not_a_real_tool" in result.content[0].text


class TestDefaultStderrRouting:
    """
    Regression: default print_fn/print_progress fallbacks MUST route to stderr, never
    stdout, since stdout is the live JSON-RPC wire when a real stdio transport is connected.
    This is the exact bug the npm package's MCP server caught and fixed (CHANGELOG.md's
    [0.3.0] entry) -- guarded here on the Python port from the start.
    """

    @pytest.mark.anyio
    async def test_with_no_overrides_output_goes_to_stderr_and_never_to_stdout(self, repo_dir):
        stderr_writes: list = []
        stdout_writes: list = []
        real_stderr_write = sys.stderr.write
        real_stdout_write = sys.stdout.write

        def fake_stderr_write(s):
            stderr_writes.append(s)
            return real_stderr_write(s)

        def fake_stdout_write(s):
            stdout_writes.append(s)
            return real_stdout_write(s)

        with patch.object(sys.stderr, "write", side_effect=fake_stderr_write), patch.object(
            sys.stdout, "write", side_effect=fake_stdout_write
        ):
            deps = base_deps(repo_dir, [])
            deps.print_fn = None
            deps.print_progress = None
            server = create_tokentrust_mcp_server(deps)
            async with create_connected_server_and_client_session(server) as client:
                result = await client.call_tool(
                    VERIFY_TOOL_NAME, {"proxy": "rtk", "tasks": resolve_default_tasks_path()}
                )

        assert result.isError is False
        assert stdout_writes == []
        assert any("Measuring..." in s for s in stderr_writes)


@asynccontextmanager
async def _closed_stdio():
    """
    Stands in for a real stdio transport (which would bind to this test process's actual
    stdin/stdout) with a pair of already-closed anyio memory streams, so start_mcp_server()
    can be exercised without hanging the test runner on an open stdin handle -- mirrors the
    TS suite's fakeStdioTransport mock of StdioServerTransport.
    """
    send_to_server, read_stream = anyio.create_memory_object_stream(0)
    write_stream, _receive_from_server = anyio.create_memory_object_stream(0)
    await send_to_server.aclose()
    try:
        yield read_stream, write_stream
    finally:
        await write_stream.aclose()


class TestStartMcpServer:
    @pytest.mark.anyio
    async def test_connects_a_real_stdio_transport_and_returns_the_underlying_server(self):
        with patch("tokentrust.mcp.server.stdio_server", _closed_stdio):
            server = await start_mcp_server(McpServerDependencies(cwd=lambda: "/tmp"))

        assert server.name == "tokentrust-cli"
        assert server.version == PACKAGE_VERSION


@pytest.fixture
def anyio_backend():
    return "asyncio"
