import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveApiCall } from './categories/tt02_cost_delta.js';
import { LIVE_API_KEY_ENV_VAR } from './categories/tt02_cost_delta.js';
import { FakeAdapter } from './test-support/fake-adapter.js';
import { resolveDefaultTasksPath, runVerify } from './verify.js';
import type { VerifyDependencies, VerifyOptions } from './verify.js';

describe('runVerify', () => {
  let repoDir: string;
  let printed: string[];

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'tokentrust-verify-'));
    printed = [];
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  function baseOptions(overrides: Partial<VerifyOptions> = {}): VerifyOptions {
    return {
      proxies: ['rtk'],
      repo: repoDir,
      tasksPath: resolveDefaultTasksPath(),
      live: false,
      confirmCost: false,
      liveMaxTasks: 5,
      format: 'terminal',
      ...overrides,
    };
  }

  function baseDeps(overrides: Partial<VerifyDependencies> = {}): VerifyDependencies {
    return {
      getAdapter: () =>
        new FakeAdapter('rtk', { baseline: () => 'token '.repeat(50), compressed: () => 'token '.repeat(20) }),
      now: () => new Date('2026-07-11T09:14:52.000Z'),
      print: (line: string) => printed.push(line),
      storePath: join(repoDir, '.tokentrust', 'report-store.json'),
      reportOutPath: join(repoDir, 'tokentrust-report-2026-07-11.json'),
      env: {},
      ...overrides,
    };
  }

  describe('cold-start: bundled default 12-task corpus with zero extra flags (E2E)', () => {
    it('produces a full report and prints the champion-tier terminal summary', async () => {
      const outcome = await runVerify(baseOptions(), baseDeps());

      expect(outcome.exitCode).toBe(0);
      expect(outcome.report?.task_corpus_size).toBe(12);
      expect(outcome.report?.records.length).toBeGreaterThan(0);
      expect(printed.some((line) => line.includes('Measuring...'))).toBe(true);
      expect(printed.some((line) => line.includes('TokenTrust v0.1'))).toBe(true);
      expect(printed.some((line) => line.includes('Report:'))).toBe(true);
    });

    it('runs a cross-tool comparison (TT04) when more than one proxy is requested', async () => {
      const adapters: Record<string, FakeAdapter> = {
        rtk: new FakeAdapter('rtk', { baseline: () => 'x'.repeat(100), compressed: () => 'x'.repeat(60) }),
        headroom: new FakeAdapter('headroom', { baseline: () => 'x'.repeat(100), compressed: () => 'x'.repeat(40) }),
      };
      const outcome = await runVerify(
        baseOptions({ proxies: ['rtk', 'headroom'] }),
        baseDeps({ getAdapter: (name) => adapters[name]! }),
      );
      expect(outcome.exitCode).toBe(0);
      const tt04Records = outcome.report?.records.filter((r) => r.category === 'TT04') ?? [];
      expect(tt04Records.map((r) => r.proxy).sort()).toEqual(['headroom', 'rtk']);
    });
  });

  describe('CRITICAL: missing-binary error path', () => {
    it('exits 1 and prints the locked verbatim message when the proxy is not installed, makes no report', async () => {
      const adapter = new FakeAdapter('rtk', { baseline: () => '', compressed: () => '' });
      adapter.installed = false;
      const outcome = await runVerify(baseOptions(), baseDeps({ getAdapter: () => adapter }));

      expect(outcome.exitCode).toBe(1);
      expect(outcome.report).toBeUndefined();
      expect(
        printed.some((line) =>
          line.includes('rtk not found on PATH. Install:') && line.includes('Then re-run this command.'),
        ),
      ).toBe(true);
    });
  });

  describe('CRITICAL: report-store corruption graceful degradation', () => {
    it('still produces a full report when the store file is corrupted, instead of crashing', async () => {
      const storePath = join(repoDir, '.tokentrust', 'report-store.json');
      mkdirSync(join(repoDir, '.tokentrust'), { recursive: true });
      writeFileSync(storePath, '{ not valid json', 'utf8');

      const outcome = await runVerify(baseOptions(), baseDeps({ storePath }));

      expect(outcome.exitCode).toBe(0);
      expect(outcome.report?.tt05.rtk?.degraded).toBe(true);
      expect(outcome.report?.tt05.rtk?.message).toContain('No drift comparison available');
    });
  });

  describe('CRITICAL: --live safety flag-combination matrix (E2E)', () => {
    it('no --live flag: the live API client is never invoked', async () => {
      const liveApiClient = vi.fn();
      const outcome = await runVerify(baseOptions({ live: false }), baseDeps({ liveApiClient }));
      expect(outcome.exitCode).toBe(0);
      expect(liveApiClient).not.toHaveBeenCalled();
    });

    it('--live alone (no --confirm-cost): exits 1, prints the cost estimate, makes ZERO API calls', async () => {
      const liveApiClient = vi.fn();
      const outcome = await runVerify(
        baseOptions({ live: true, confirmCost: false }),
        baseDeps({ liveApiClient, env: { [LIVE_API_KEY_ENV_VAR]: 'sk-should-not-be-used' } }),
      );

      expect(outcome.exitCode).toBe(1);
      expect(liveApiClient).not.toHaveBeenCalled();
      expect(printed.some((line) => line.includes('--confirm-cost'))).toBe(true);
    });

    it('--live --confirm-cost but task count exceeds --live-max-tasks: exits 1, makes ZERO API calls', async () => {
      const liveApiClient = vi.fn();
      // Bundled corpus has 12 tasks; cap of 5 forces the over-cap refusal path.
      const outcome = await runVerify(
        baseOptions({ live: true, confirmCost: true, liveMaxTasks: 5 }),
        baseDeps({ liveApiClient, env: { [LIVE_API_KEY_ENV_VAR]: 'sk-should-not-be-used' } }),
      );

      expect(outcome.exitCode).toBe(1);
      expect(liveApiClient).not.toHaveBeenCalled();
      expect(printed.some((line) => line.includes('exceeds --live-max-tasks'))).toBe(true);
    });

    it('--live --confirm-cost within the cap and API key present: proceeds and calls the live API client', async () => {
      const liveApiClient = vi.fn(async (taskId: string): Promise<LiveApiCall> => ({ taskId, billedInputTokens: 42 }));
      const outcome = await runVerify(
        baseOptions({ live: true, confirmCost: true, liveMaxTasks: 20 }),
        baseDeps({ liveApiClient, env: { [LIVE_API_KEY_ENV_VAR]: 'sk-real-looking-key' } }),
      );

      expect(outcome.exitCode).toBe(0);
      expect(liveApiClient).toHaveBeenCalled();
      expect(printed.some((line) => line.includes('Live mode confirmed'))).toBe(true);
    });

    it('--live --confirm-cost within cap but NO API key set: exits 1, makes ZERO API calls', async () => {
      const liveApiClient = vi.fn();
      const outcome = await runVerify(
        baseOptions({ live: true, confirmCost: true, liveMaxTasks: 20 }),
        baseDeps({ liveApiClient, env: {} }),
      );

      expect(outcome.exitCode).toBe(1);
      expect(liveApiClient).not.toHaveBeenCalled();
      expect(printed.some((line) => line.includes(LIVE_API_KEY_ENV_VAR))).toBe(true);
    });
  });

  describe('task schema errors', () => {
    it('exits 1 with a readable error when the task corpus file is invalid', async () => {
      const badPath = join(repoDir, 'bad-tasks.yml');
      writeFileSync(badPath, 'not: [valid', 'utf8');
      const outcome = await runVerify(baseOptions({ tasksPath: badPath }), baseDeps());
      expect(outcome.exitCode).toBe(1);
      expect(printed.some((line) => line.startsWith('Error:'))).toBe(true);
    });
  });

  describe('format: json', () => {
    it('prints the serialized report instead of the terminal summary', async () => {
      const outcome = await runVerify(baseOptions({ format: 'json' }), baseDeps());
      expect(outcome.exitCode).toBe(0);
      const jsonLine = printed.find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();
      expect(() => JSON.parse(jsonLine!)).not.toThrow();
    });
  });
});
