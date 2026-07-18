import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { serializeReport } from '../report/json.js';
import { renderProgress } from '../report/terminal.js';
import {
  DEFAULT_LIVE_MAX_TASKS_OPTION,
  resolveDefaultTasksPath,
  runVerify,
} from '../verify.js';
import type { VerifyDependencies, VerifyOptions } from '../verify.js';
import {
  VERIFY_TOOL_DESCRIPTION,
  VERIFY_TOOL_NAME,
  VERIFY_TOOL_TITLE,
  normalizeProxyInput,
  verifyProxySavingsInputShape,
} from './tool-schema.js';
import type { VerifyProxySavingsInput } from './tool-schema.js';

/**
 * Same dual CLI + MCP-server pattern Semgrep/Trivy/Snyk/SonarQube ship:
 * one binary, one underlying engine (runVerify()), a thin additional
 * transport on top. Nothing in this file re-implements verification logic
 * -- it only maps an MCP tool call's input onto VerifyOptions and its
 * output back onto the same structured report `tokentrust verify --format
 * json` already produces (src/report/types.ts's FullReport).
 */
export interface McpServerDependencies extends VerifyDependencies {
  /** Overridable for tests; defaults to process.cwd() at call time, matching the CLI's --repo default. */
  cwd?: () => string;
}

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgJsonPath = resolve(here, '..', '..', 'package.json');
  const raw = readFileSync(pkgJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}

export const PACKAGE_VERSION = readPackageVersion();

/**
 * Builds the MCP server WITHOUT connecting a transport, so tests can attach
 * an in-memory transport pair instead of the real stdio one (real stdio
 * would bind to this process's actual stdin/stdout).
 */
export function createTokenTrustMcpServer(deps: McpServerDependencies = {}): McpServer {
  const cwd = deps.cwd ?? (() => process.cwd());

  // Stdio is the MCP transport's actual wire protocol here -- every byte
  // written to stdout by a connected transport IS a JSON-RPC message.
  // runVerify()'s defaults write BOTH the trace/report (via its print()
  // dependency, console.log) and the per-task progress ticker (via
  // report/terminal.ts's printProgress(), which writes directly to
  // process.stdout and is not routed through print() at all) straight to
  // stdout. Either one would corrupt the JSON-RPC stream, so both are
  // rerouted to stderr here unless a caller (a test) supplies its own.
  const verifyDeps: VerifyDependencies = {
    ...deps,
    print: deps.print ?? ((line: string) => process.stderr.write(`${line}\n`)),
    printProgress:
      deps.printProgress ?? ((done: number, total: number) => process.stderr.write(`${renderProgress(done, total)}\n`)),
  };

  const server = new McpServer({
    name: 'tokentrust-cli',
    version: PACKAGE_VERSION,
  });

  server.registerTool(
    VERIFY_TOOL_NAME,
    {
      title: VERIFY_TOOL_TITLE,
      description: VERIFY_TOOL_DESCRIPTION,
      inputSchema: verifyProxySavingsInputShape,
    },
    async (input: VerifyProxySavingsInput): Promise<CallToolResult> => {
      const options: VerifyOptions = {
        proxies: normalizeProxyInput(input.proxy),
        repo: input.repo ?? cwd(),
        tasksPath: input.tasks ?? resolveDefaultTasksPath(),
        live: input.live ?? false,
        confirmCost: input.confirmCost ?? false,
        liveMaxTasks: input.liveMaxTasks ?? DEFAULT_LIVE_MAX_TASKS_OPTION,
        // Always structured JSON: an MCP tool call is a machine-facing
        // surface, never the human terminal one --format terminal renders.
        format: 'json',
      };

      const outcome = await runVerify(options, verifyDeps);

      const responseText =
        outcome.report !== undefined
          ? serializeReport(outcome.report)
          : JSON.stringify(
              {
                ok: false,
                exit_code: outcome.exitCode,
                message:
                  'Verification did not produce a report -- see the tool result text for the reason ' +
                  '(e.g. a missing proxy binary, an invalid task corpus, or the --live safety gate ' +
                  'refusing the call).',
              },
              null,
              2,
            );

      return {
        content: [{ type: 'text', text: responseText }],
        isError: outcome.exitCode !== 0,
      };
    },
  );

  return server;
}

/** Starts the real stdio MCP server. This is what `tokentrust mcp` runs. */
export async function startMcpServer(deps: McpServerDependencies = {}): Promise<McpServer> {
  const server = createTokenTrustMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
