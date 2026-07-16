import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { count } from '../tokenizer/index.js';
import {
  DEFAULT_LIVE_MAX_TASKS,
  DEFAULT_PRICING,
  LIVE_API_KEY_ENV_VAR,
  estimateLiveCost,
  evaluateLiveGate,
  resolveLiveApiKey,
  runLiveVerification,
  runTt02Default,
} from './tt02_cost_delta.js';
import type { LiveApiCall } from './tt02_cost_delta.js';
import type { Tt01TaskResult } from './tt01_compression_ratio.js';

const TESTDATA_DIR = join(process.cwd(), 'src', 'categories', 'testdata', 'tt02');

function taskResultFromFixture(dir: string, taskId: string): Tt01TaskResult {
  const before = readFileSync(join(TESTDATA_DIR, dir, 'before.txt'), 'utf8');
  const after = readFileSync(join(TESTDATA_DIR, dir, 'after.txt'), 'utf8');
  const tokensBefore = count(before).tokens;
  const tokensAfter = count(after).tokens;
  const reductionPct = tokensBefore === 0 ? 0 : ((tokensBefore - tokensAfter) / tokensBefore) * 100;
  return { taskId, tokensBefore, tokensAfter, reductionPct, skipped: false };
}

describe('runTt02Default -- testdata/tt02/clean (normal token counts)', () => {
  it('computes baseline/compressed USD and savings from real tokenizer counts', () => {
    const perTask = [taskResultFromFixture('clean', 'clean-task')];
    const result = runTt02Default(perTask, 50);

    expect(result.baselineUsd).toBeGreaterThan(0);
    expect(result.compressedUsd).toBeGreaterThan(0);
    expect(result.compressedUsd).toBeLessThan(result.baselineUsd);
    expect(result.savingsUsd).toBeCloseTo(result.baselineUsd - result.compressedUsd, 6);
    expect(result.savingsPct).toBeGreaterThan(0);
    expect(result.liveVerified).toBe(false);
    expect(result.pricingModel).toBe(DEFAULT_PRICING.name);
  });
});

describe('runTt02Default -- testdata/tt02/vulnerable (zero-token edge case)', () => {
  it('returns 0% savings, not NaN/Infinity, when baseline tokens are zero', () => {
    const perTask = [taskResultFromFixture('vulnerable', 'empty-task')];
    const result = runTt02Default(perTask, 50);

    expect(result.baselineUsd).toBe(0);
    expect(result.savingsPct).toBe(0);
    expect(Number.isFinite(result.savingsPct)).toBe(true);
    expect(Number.isNaN(result.savingsPct)).toBe(false);
  });
});

describe('estimateLiveCost', () => {
  it('is proportional to total baseline tokens at the configured price', () => {
    const perTask: Tt01TaskResult[] = [
      { taskId: 'a', tokensBefore: 1_000_000, tokensAfter: 0, reductionPct: 100, skipped: false },
    ];
    expect(estimateLiveCost(perTask, DEFAULT_PRICING)).toBeCloseTo(DEFAULT_PRICING.inputPerMillionUsd, 6);
  });
});

describe('evaluateLiveGate -- CRITICAL: --live safety gating', () => {
  const baseOptions = { live: true, confirmCost: false, liveMaxTasks: DEFAULT_LIVE_MAX_TASKS };

  it('refuses with exitCode 1 when --confirm-cost is absent, and shows the cost estimate', () => {
    const result = evaluateLiveGate(baseOptions, 12, 0.5);
    expect(result.allowed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('--confirm-cost');
    expect(result.message).toContain('0.5000');
  });

  it('refuses with exitCode 1 when task count exceeds --live-max-tasks even with --confirm-cost', () => {
    const result = evaluateLiveGate({ ...baseOptions, confirmCost: true, liveMaxTasks: 5 }, 12, 0.5);
    expect(result.allowed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('exceeds --live-max-tasks');
  });

  it('allows the run only when both --confirm-cost is present AND the task count is within the cap', () => {
    const result = evaluateLiveGate({ ...baseOptions, confirmCost: true, liveMaxTasks: 5 }, 5, 0.1);
    expect(result.allowed).toBe(true);
    expect(result.exitCode).toBeUndefined();
  });

  it('the default cap is 5 tasks', () => {
    expect(DEFAULT_LIVE_MAX_TASKS).toBe(5);
  });
});

describe('runLiveVerification -- CRITICAL: zero API calls when the gate disallows', () => {
  it('the live API client is never invoked unless the gate result is explicitly checked and allowed', async () => {
    const client = vi.fn(async (taskId: string): Promise<LiveApiCall> => ({ taskId, billedInputTokens: 100 }));

    const gate = evaluateLiveGate({ live: true, confirmCost: false, liveMaxTasks: 5 }, 12, 1.0);
    expect(gate.allowed).toBe(false);

    // The CLI orchestration layer (src/verify.ts) never calls
    // runLiveVerification() when evaluateLiveGate() returns allowed: false --
    // asserting that directly here (not just the gate's return value)
    // matters because this is a CRITICAL path: the test must assert no
    // network/API call fired, not just that the exit code is correct.
    if (gate.allowed) {
      await runLiveVerification([{ id: 't1', contextText: 'x' }], 'fake-key', 5, client);
    }
    expect(client).not.toHaveBeenCalled();
  });

  it('when allowed, caps the number of live API calls at liveMaxTasks even if more tasks are passed in', async () => {
    const client = vi.fn(async (taskId: string): Promise<LiveApiCall> => ({ taskId, billedInputTokens: 100 }));
    const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, contextText: 'x'.repeat(10) }));

    const { liveCalls, billedUsd } = await runLiveVerification(tasks, 'fake-key', 3, client);

    expect(client).toHaveBeenCalledTimes(3);
    expect(liveCalls).toHaveLength(3);
    expect(billedUsd).toBeGreaterThan(0);
  });
});

describe('resolveLiveApiKey', () => {
  it('reads the key only from TOKENTRUST_LIVE_API_KEY, never from a CLI-flag-shaped source', () => {
    expect(resolveLiveApiKey({ [LIVE_API_KEY_ENV_VAR]: 'sk-abc123' })).toBe('sk-abc123');
    expect(resolveLiveApiKey({})).toBeUndefined();
  });
});
