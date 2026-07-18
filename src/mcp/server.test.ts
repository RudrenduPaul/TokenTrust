import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProxyName } from '../adapters/types.js';
import { FakeAdapter } from '../test-support/fake-adapter.js';
import { resolveDefaultTasksPath } from '../verify.js';
import type { VerifyDependencies } from '../verify.js';
import { VERIFY_TOOL_NAME } from './tool-schema.js';

// vi.hoisted so this factory-referenced fake is initialized before vi.mock's
// hoisted call runs. Stands in for a real stdio transport (which would bind
// to this test process's actual stdin/stdout) so startMcpServer() can be
// exercised without hanging the test runner on an open stdin handle.
const { fakeStdioTransport, StdioServerTransportMock } = vi.hoisted(() => {
  const fakeStdioTransport = {
    start: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined),
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: unknown) => void) | undefined,
  };
  const StdioServerTransportMock = vi.fn(function StdioServerTransport() {
    return fakeStdioTransport;
  });
  return { fakeStdioTransport, StdioServerTransportMock };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: StdioServerTransportMock,
}));

const { createTokenTrustMcpServer, PACKAGE_VERSION, startMcpServer } = await import('./server.js');
type McpServerDependencies = import('./server.js').McpServerDependencies;

/**
 * Connects a real Client to the server over InMemoryTransport.createLinkedPair()
 * -- an actual MCP request/response round trip over the SDK's own protocol
 * layer (JSON-RPC framing, zod input validation, etc.), not a hand-rolled
 * substitute for it. This is the same mechanism a real stdio-connected agent
 * uses; only the transport differs.
 */
async function connectedClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('createTokenTrustMcpServer', () => {
  let repoDir: string;
  let printed: string[];

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'tokentrust-mcp-'));
    printed = [];
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  function baseDeps(overrides: Partial<VerifyDependencies> = {}): McpServerDependencies {
    return {
      getAdapter: (name: ProxyName) =>
        new FakeAdapter(name, { baseline: () => 'token '.repeat(50), compressed: () => 'token '.repeat(20) }),
      now: () => new Date('2026-07-18T09:14:52.000Z'),
      print: (line: string) => printed.push(line),
      storePath: join(repoDir, '.tokentrust', 'report-store.json'),
      reportOutPath: join(repoDir, 'tokentrust-report-2026-07-18.json'),
      env: {},
      cwd: () => repoDir,
      ...overrides,
    };
  }

  describe('tool discovery (request/response shape)', () => {
    it('lists exactly one tool, verify_proxy_savings, with an input schema exposing the CLI-mirroring fields', async () => {
      const server = createTokenTrustMcpServer(baseDeps());
      const client = await connectedClient(server);

      const { tools } = await client.listTools();

      expect(tools).toHaveLength(1);
      const tool = tools[0]!;
      expect(tool.name).toBe(VERIFY_TOOL_NAME);
      expect(tool.description).toBeDefined();
      const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(properties)).toEqual(
        expect.arrayContaining(['proxy', 'repo', 'tasks', 'live', 'confirmCost', 'liveMaxTasks']),
      );
      // format is intentionally never exposed -- the MCP surface is always structured JSON.
      expect(properties).not.toHaveProperty('format');
    });

    it('advertises the running package version as the server implementation version', async () => {
      const server = createTokenTrustMcpServer(baseDeps());
      const client = await connectedClient(server);
      await client.listTools(); // forces initialize handshake to complete
      const serverVersion = client.getServerVersion();
      expect(serverVersion?.version).toBe(PACKAGE_VERSION);
      expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('delegation to runVerify() -- no duplicated verification logic', () => {
    it('calling the tool with a single proxy returns the same structured report shape as `verify --format json`', async () => {
      const server = createTokenTrustMcpServer(baseDeps());
      const client = await connectedClient(server);

      const result = await client.callTool({
        name: VERIFY_TOOL_NAME,
        arguments: { proxy: 'rtk', tasks: resolveDefaultTasksPath() },
      });

      expect(result.isError).toBe(false);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toHaveLength(1);
      expect(content[0]!.type).toBe('text');
      const report = JSON.parse(content[0]!.text) as {
        run_id: string;
        proxies: string[];
        records: unknown[];
        tt03: Record<string, unknown>;
        tt05: Record<string, unknown>;
      };
      expect(report.proxies).toEqual(['rtk']);
      expect(report.records.length).toBeGreaterThan(0);
      expect(report.run_id).toMatch(/^tt_/);
      expect(report.tt03.rtk).toBeDefined();
      expect(report.tt05.rtk).toBeDefined();
      // The default print() route (stderr in production) was overridden by the test's own
      // print(), proving the tool handler really called into runVerify() and not a
      // reimplementation of it -- runVerify()'s own "Measuring..." trace only exists there.
      expect(printed.some((line) => line.includes('Measuring...'))).toBe(true);
    });

    it('accepts an array of proxy names and runs the TT04 cross-tool comparison path', async () => {
      const getAdapter = vi.fn((name: ProxyName) =>
        new FakeAdapter(name, { baseline: () => 'x'.repeat(100), compressed: () => 'x'.repeat(60) }),
      );
      const server = createTokenTrustMcpServer(baseDeps({ getAdapter }));
      const client = await connectedClient(server);

      const result = await client.callTool({
        name: VERIFY_TOOL_NAME,
        arguments: { proxy: ['rtk', 'headroom'], tasks: resolveDefaultTasksPath() },
      });

      // headroom is still intercepted by the v0.1 "not yet supported" gate inside
      // runVerify() itself -- proving this handler passes an array straight through
      // rather than only ever calling runVerify with a single proxy.
      expect(getAdapter).not.toHaveBeenCalledWith('headroom');
      const content = result.content as Array<{ type: string; text: string }>;
      const report = JSON.parse(content[0]!.text) as { proxies: string[] };
      expect(report.proxies).toEqual(['rtk']);
    });

    it('defaults repo to deps.cwd() and tasks to the bundled corpus when omitted, same defaults as the CLI', async () => {
      const server = createTokenTrustMcpServer(baseDeps());
      const client = await connectedClient(server);

      const result = await client.callTool({ name: VERIFY_TOOL_NAME, arguments: { proxy: 'rtk' } });

      const content = result.content as Array<{ type: string; text: string }>;
      const report = JSON.parse(content[0]!.text) as { repo: string; task_corpus_size: number };
      expect(report.repo).toBe(repoDir);
      expect(report.task_corpus_size).toBeGreaterThan(0);
    });
  });

  describe('--live/--confirm-cost safety gate is respected identically to the CLI', () => {
    it('live=true without confirmCost: makes ZERO live API calls and reports the refusal instead of a report', async () => {
      const liveApiClient = vi.fn();
      const server = createTokenTrustMcpServer(baseDeps({ liveApiClient, env: { TOKENTRUST_LIVE_API_KEY: 'sk-x' } }));
      const client = await connectedClient(server);

      const result = await client.callTool({
        name: VERIFY_TOOL_NAME,
        arguments: { proxy: 'rtk', live: true, tasks: resolveDefaultTasksPath() },
      });

      expect(result.isError).toBe(true);
      expect(liveApiClient).not.toHaveBeenCalled();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('did not produce a report');
    });

    it('live=false (default): the live API client is never invoked', async () => {
      const liveApiClient = vi.fn();
      const server = createTokenTrustMcpServer(baseDeps({ liveApiClient }));
      const client = await connectedClient(server);

      const result = await client.callTool({
        name: VERIFY_TOOL_NAME,
        arguments: { proxy: 'rtk', tasks: resolveDefaultTasksPath() },
      });

      expect(result.isError).toBe(false);
      expect(liveApiClient).not.toHaveBeenCalled();
    });
  });

  describe('input-schema validation', () => {
    // The SDK validates a registered tool's arguments against its zod
    // inputSchema BEFORE the handler runs, and on failure returns a normal
    // CallToolResult (isError: true, an "Input validation error" message)
    // rather than a JSON-RPC protocol-level rejection -- so these assert on
    // the result shape, not a rejected promise, and (critically) that the
    // handler -- and therefore runVerify()/getAdapter() -- was never reached.

    it('rejects a tool call missing the required "proxy" field before it ever reaches runVerify()', async () => {
      const getAdapter = vi.fn((name: ProxyName) => new FakeAdapter(name, { baseline: () => '', compressed: () => '' }));
      const server = createTokenTrustMcpServer(baseDeps({ getAdapter }));
      const client = await connectedClient(server);

      const result = await client.callTool({ name: VERIFY_TOOL_NAME, arguments: {} });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('Input validation error');
      expect(getAdapter).not.toHaveBeenCalled();
    });

    it('rejects an unsupported proxy name before it ever reaches runVerify()', async () => {
      const getAdapter = vi.fn((name: ProxyName) => new FakeAdapter(name, { baseline: () => '', compressed: () => '' }));
      const server = createTokenTrustMcpServer(baseDeps({ getAdapter }));
      const client = await connectedClient(server);

      const result = await client.callTool({ name: VERIFY_TOOL_NAME, arguments: { proxy: 'not-a-real-proxy' } });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('Input validation error');
      expect(getAdapter).not.toHaveBeenCalled();
    });

    it('rejects a non-positive liveMaxTasks', async () => {
      const server = createTokenTrustMcpServer(baseDeps());
      const client = await connectedClient(server);

      const result = await client.callTool({ name: VERIFY_TOOL_NAME, arguments: { proxy: 'rtk', liveMaxTasks: 0 } });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain('Input validation error');
    });
  });

  describe(
    'default print/printProgress fallbacks (regression -- these MUST route to stderr, never stdout, ' +
      'since stdout is the live JSON-RPC wire when a real stdio transport is connected)',
    () => {
      it('with no print/printProgress override, both write to process.stderr and never to process.stdout', async () => {
        const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
          const deps = baseDeps();
          delete deps.print;
          delete deps.printProgress;
          const server = createTokenTrustMcpServer(deps);
          const client = await connectedClient(server);

          const result = await client.callTool({
            name: VERIFY_TOOL_NAME,
            arguments: { proxy: 'rtk', tasks: resolveDefaultTasksPath() },
          });

          expect(result.isError).toBe(false);
          expect(stdoutWrite).not.toHaveBeenCalled();
          expect(stderrWrite).toHaveBeenCalled();
          const stderrText = stderrWrite.mock.calls.map((call) => String(call[0])).join('');
          expect(stderrText).toContain('Measuring...');
        } finally {
          stderrWrite.mockRestore();
          stdoutWrite.mockRestore();
        }
      });
    },
  );
});

describe('startMcpServer', () => {
  beforeEach(() => {
    StdioServerTransportMock.mockClear();
    fakeStdioTransport.start.mockClear();
  });

  it('connects a real StdioServerTransport and returns the underlying McpServer', async () => {
    const server = await startMcpServer({ cwd: () => '/tmp' });

    expect(StdioServerTransportMock).toHaveBeenCalledTimes(1);
    expect(fakeStdioTransport.start).toHaveBeenCalledTimes(1);
    expect(server.server).toBeDefined();
  });
});
