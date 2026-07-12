import type { Tt01TaskResult } from './tt01_compression_ratio.js';

export interface PricingModel {
  /** Human-readable label shown in reports, e.g. "claude-5-sonnet". */
  name: string;
  /** USD per 1,000,000 input tokens. */
  inputPerMillionUsd: number;
}

/**
 * Local pricing table used by the default (free, no-API-call) path. This is
 * a directional estimate, not a live billed total -- see --live mode below
 * for the opt-in, provider-verified path.
 */
export const DEFAULT_PRICING: PricingModel = {
  name: 'claude-5-sonnet',
  inputPerMillionUsd: 3,
};

export interface Tt02Result {
  category: 'TT02';
  claimedSavingsPct: number | null;
  baselineUsd: number;
  compressedUsd: number;
  savingsUsd: number;
  savingsPct: number;
  taskCorpusSize: number;
  pricingModel: string;
  liveVerified: boolean;
}

/**
 * TT02 Cost-Savings Delta (default path) -- computes actual dollar-cost
 * savings at current published model pricing from TT01's measured token
 * delta. This is the free, local-only path: no API calls, near-zero
 * marginal cost per run.
 */
export function runTt02Default(
  perTask: Tt01TaskResult[],
  claimedSavingsPct: number | null,
  pricing: PricingModel = DEFAULT_PRICING,
): Tt02Result {
  const counted = perTask.filter((t) => !t.skipped);
  const totalBefore = counted.reduce((sum, t) => sum + t.tokensBefore, 0);
  const totalAfter = counted.reduce((sum, t) => sum + t.tokensAfter, 0);

  const baselineUsd = (totalBefore / 1_000_000) * pricing.inputPerMillionUsd;
  const compressedUsd = (totalAfter / 1_000_000) * pricing.inputPerMillionUsd;
  const savingsUsd = baselineUsd - compressedUsd;
  const savingsPct = baselineUsd === 0 ? 0 : (savingsUsd / baselineUsd) * 100;

  return {
    category: 'TT02',
    claimedSavingsPct,
    baselineUsd,
    compressedUsd,
    savingsUsd,
    savingsPct,
    taskCorpusSize: perTask.length,
    pricingModel: pricing.name,
    liveVerified: false,
  };
}

// ---------------------------------------------------------------------------
// --live mode: opt-in provider-billed verification. This is the one real
// security/cost boundary in
// the system -- see the locked gate diagram below. No import here ever
// reaches for an API key or fires a network call outside evaluateLiveGate's
// `allowed: true` branch and runLiveVerification, both of which the CLI only
// invokes after the gate has already returned allowed: true.
// ---------------------------------------------------------------------------

export const LIVE_API_KEY_ENV_VAR = 'TOKENTRUST_LIVE_API_KEY';
export const DEFAULT_LIVE_MAX_TASKS = 5;

export interface LiveModeOptions {
  live: boolean;
  confirmCost: boolean;
  liveMaxTasks: number;
}

export interface LiveGateResult {
  allowed: boolean;
  /** Present only when the gate refuses to proceed. */
  exitCode?: 1;
  message: string;
  estimatedCostUsd: number;
}

/**
 * Estimates the cost of a --live run from the free, local-tokenizer dry
 * pass -- this is always computed BEFORE any gating decision, and is itself
 * zero-cost (no network call).
 */
export function estimateLiveCost(
  perTask: Tt01TaskResult[],
  pricing: PricingModel = DEFAULT_PRICING,
): number {
  const totalBefore = perTask.reduce((sum, t) => sum + t.tokensBefore, 0);
  return (totalBefore / 1_000_000) * pricing.inputPerMillionUsd;
}

/**
 * Locked gate:
 *
 *   --live alone            -> refuse, print cost estimate, EXIT 1, no API call
 *   --live --confirm-cost,
 *     taskCount > cap       -> refuse, EXIT 1, no API call
 *   --live --confirm-cost,
 *     taskCount <= cap      -> allowed
 *
 * This function makes no network call under any branch -- it only decides
 * whether the caller (cli.ts) may proceed to runLiveVerification. Tests
 * assert zero calls to the live API client when this returns allowed: false,
 * not merely that the CLI's exit code is 1 -- this is a CRITICAL path, so
 * the stronger assertion matters.
 */
export function evaluateLiveGate(
  options: LiveModeOptions,
  taskCount: number,
  estimatedCostUsd: number,
): LiveGateResult {
  if (!options.confirmCost) {
    return {
      allowed: false,
      exitCode: 1,
      estimatedCostUsd,
      message:
        `--live requires --confirm-cost.\n` +
        `Estimated cost for this run: $${estimatedCostUsd.toFixed(4)} (${taskCount} tasks).\n` +
        `Re-run with: --live --confirm-cost\n` +
        `To change the task cap, add --live-max-tasks N (default ${DEFAULT_LIVE_MAX_TASKS}).`,
    };
  }

  if (taskCount > options.liveMaxTasks) {
    return {
      allowed: false,
      exitCode: 1,
      estimatedCostUsd,
      message:
        `Task count (${taskCount}) exceeds --live-max-tasks (${options.liveMaxTasks}).\n` +
        `Reduce the task corpus or pass a higher --live-max-tasks value explicitly.`,
    };
  }

  return {
    allowed: true,
    estimatedCostUsd,
    message: `Live mode confirmed. Estimated cost: $${estimatedCostUsd.toFixed(4)} for ${taskCount} tasks (capped at ${options.liveMaxTasks}).`,
  };
}

export interface LiveApiCall {
  taskId: string;
  billedInputTokens: number;
}

/**
 * Injected by the caller so tests can assert call counts without a real
 * network dependency. The default implementation (cli.ts wiring) reads the
 * API key from process.env[LIVE_API_KEY_ENV_VAR] only -- never from a CLI
 * flag, since flags leak into shell history and CI logs.
 */
export type LiveApiClient = (taskId: string, contextText: string, apiKey: string) => Promise<LiveApiCall>;

export interface Tt02LiveResult extends Tt02Result {
  liveVerified: true;
  liveCalls: LiveApiCall[];
}

/**
 * Runs the real, provider-billed verification sample -- only ever called
 * after evaluateLiveGate has returned { allowed: true }. Capped at
 * options.liveMaxTasks tasks regardless of the caller-supplied task list
 * length, as a defense-in-depth measure against a caller bug bypassing the
 * gate's own cap check.
 */
export async function runLiveVerification(
  tasks: Array<{ id: string; contextText: string }>,
  apiKey: string,
  liveMaxTasks: number,
  client: LiveApiClient,
  pricing: PricingModel = DEFAULT_PRICING,
): Promise<{ liveCalls: LiveApiCall[]; billedUsd: number }> {
  const capped = tasks.slice(0, liveMaxTasks);
  const liveCalls: LiveApiCall[] = [];
  for (const task of capped) {
    const result = await client(task.id, task.contextText, apiKey);
    liveCalls.push(result);
  }
  const totalBilledTokens = liveCalls.reduce((sum, c) => sum + c.billedInputTokens, 0);
  const billedUsd = (totalBilledTokens / 1_000_000) * pricing.inputPerMillionUsd;
  return { liveCalls, billedUsd };
}

export function resolveLiveApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[LIVE_API_KEY_ENV_VAR];
}
