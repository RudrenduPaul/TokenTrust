import { z } from 'zod/v4';
import { SUPPORTED_PROXIES } from '../adapters/registry.js';
import type { ProxyName } from '../adapters/types.js';
import { DEFAULT_LIVE_MAX_TASKS_OPTION } from '../verify.js';

/**
 * Name of the single MCP tool this package exposes. Kept as a named
 * constant (not inlined) so the server module and its tests can never drift
 * on the string an MCP client actually has to call.
 */
export const VERIFY_TOOL_NAME = 'verify_proxy_savings';

export const VERIFY_TOOL_TITLE = 'Verify proxy token/cost savings';

export const VERIFY_TOOL_DESCRIPTION =
  'Independently verifies an AI-coding-agent context-reduction proxy\'s (rtk, headroom) claimed ' +
  'token/cost savings against a real, labeled task corpus and a local tokenizer -- the same engine ' +
  '`tokentrust verify` uses on the command line. Returns the structured JSON report (claimed vs. ' +
  'measured savings, TT01-TT05 category results) so an agent can compare the two numbers directly ' +
  'instead of trusting the proxy\'s own claim. No live, provider-billed API calls are made unless ' +
  'both `live` and `confirmCost` are set to true in the same call.';

/**
 * SUPPORTED_PROXIES is typed ProxyName[] (not a literal tuple) because
 * registry.ts intentionally keeps it a small, explicit, mutable-looking
 * array rather than a `const` tuple -- see the comment there. It always has
 * at least one entry at runtime (currently ['rtk', 'headroom']), so this
 * cast to a non-empty tuple for z.enum() is safe.
 */
const PROXY_NAME_VALUES = SUPPORTED_PROXIES as [ProxyName, ...ProxyName[]];

const proxyNameSchema = z.enum(PROXY_NAME_VALUES);

/**
 * Raw zod shape (not a wrapped z.object()) -- this is the exact input format
 * McpServer#registerTool()'s `inputSchema` config field expects, so it can
 * be handed straight to registerTool without re-wrapping.
 *
 * Mirrors src/cli.ts's `verify` flags one-for-one, MINUS `--format`: the
 * CLI's `--format terminal|json` toggles a human-readable summary vs. a
 * machine-readable report, but an MCP tool call is always machine-facing,
 * so this tool always returns the structured JSON report and never exposes
 * a format choice.
 */
export const verifyProxySavingsInputShape = {
  proxy: z
    .union([proxyNameSchema, z.array(proxyNameSchema).min(1)])
    .describe(
      'Proxy name to verify. Pass a single name (e.g. "rtk") or an array of names to run the ' +
        'TT04 cross-tool comparison across all of them in one call -- mirrors the CLI\'s repeatable ' +
        `--proxy flag. Supported: ${SUPPORTED_PROXIES.join(', ')}.`,
    ),
  repo: z
    .string()
    .optional()
    .describe(
      'Filesystem path to the repo to measure against. Defaults to the MCP server process\'s ' +
        'current working directory, same as the CLI\'s --repo default.',
    ),
  tasks: z
    .string()
    .optional()
    .describe(
      'Path to a task corpus YAML file. Defaults to the bundled task corpus shipped with the ' +
        'package, same as the CLI\'s --tasks default.',
    ),
  live: z
    .boolean()
    .optional()
    .describe(
      'Sample real, provider-billed tokens for the first proxy instead of estimating from local ' +
        'pricing tables. Requires confirmCost=true in the SAME call, exactly like the CLI\'s ' +
        '--live/--confirm-cost safety gate -- setting only one of the two makes zero API calls and ' +
        'reports the refusal instead. Defaults to false.',
    ),
  confirmCost: z
    .boolean()
    .optional()
    .describe(
      'Confirms the estimated spend `live` mode would print before any real, billed API call is ' +
        'made. Defaults to false. Has no effect unless `live` is also true.',
    ),
  liveMaxTasks: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Max tasks sampled in live mode. Defaults to ${DEFAULT_LIVE_MAX_TASKS_OPTION}.`),
};

export const verifyProxySavingsInputSchema = z.object(verifyProxySavingsInputShape);

export type VerifyProxySavingsInput = z.infer<typeof verifyProxySavingsInputSchema>;

/** Normalizes the tool's `proxy` field (single name or array) into the array shape runVerify() expects. */
export function normalizeProxyInput(proxy: ProxyName | ProxyName[]): ProxyName[] {
  return Array.isArray(proxy) ? proxy : [proxy];
}
