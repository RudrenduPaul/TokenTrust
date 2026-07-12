import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveApiCall } from './categories/tt02_cost_delta.js';
import { LIVE_API_KEY_ENV_VAR } from './categories/tt02_cost_delta.js';
import { FakeAdapter } from './test-support/fake-adapter.js';
import { ProxyExecutionError } from './adapters/types.js';
import type { ProxyAdapter, AdapterResult, ProxyName } from './adapters/types.js';
import type { Task } from './tasks/types.js';
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

  describe('cold-start: bundled default 15-task corpus with zero extra flags (E2E)', () => {
    it('produces a full report and prints the champion-tier terminal summary', async () => {
      const outcome = await runVerify(baseOptions(), baseDeps());

      expect(outcome.exitCode).toBe(0);
      expect(outcome.report?.task_corpus_size).toBe(23);
      expect(outcome.report?.records.length).toBeGreaterThan(0);
      expect(printed.some((line) => line.includes('Measuring...'))).toBe(true);
      expect(printed.some((line) => line.includes('TokenTrust v0.1'))).toBe(true);
      expect(printed.some((line) => line.includes('Report:'))).toBe(true);
    });

    it('runs a cross-tool comparison (TT04) when more than one proxy is requested', async () => {
      const adapters: Record<string, FakeAdapter> = {
        rtk: new FakeAdapter('rtk', { baseline: () => 'x'.repeat(100), compressed: () => 'x'.repeat(60) }),
        'lean-ctx': new FakeAdapter('lean-ctx', { baseline: () => 'x'.repeat(100), compressed: () => 'x'.repeat(40) }),
      };
      const outcome = await runVerify(
        baseOptions({ proxies: ['rtk', 'lean-ctx'] }),
        baseDeps({ getAdapter: (name) => adapters[name]! }),
      );
      expect(outcome.exitCode).toBe(0);
      const tt04Records = outcome.report?.records.filter((r) => r.category === 'TT04') ?? [];
      expect(tt04Records.map((r) => r.proxy).sort()).toEqual(['lean-ctx', 'rtk']);
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
      // Bundled corpus has 15 tasks; cap of 5 forces the over-cap refusal path.
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
        baseOptions({ live: true, confirmCost: true, liveMaxTasks: 25 }),
        baseDeps({ liveApiClient, env: { [LIVE_API_KEY_ENV_VAR]: 'sk-real-looking-key' } }),
      );

      expect(outcome.exitCode).toBe(0);
      expect(liveApiClient).toHaveBeenCalled();
      expect(printed.some((line) => line.includes('Live mode confirmed'))).toBe(true);
    });

    it('--live --confirm-cost within cap but NO API key set: exits 1, makes ZERO API calls', async () => {
      const liveApiClient = vi.fn();
      const outcome = await runVerify(
        baseOptions({ live: true, confirmCost: true, liveMaxTasks: 25 }),
        baseDeps({ liveApiClient, env: {} }),
      );

      expect(outcome.exitCode).toBe(1);
      expect(liveApiClient).not.toHaveBeenCalled();
      expect(printed.some((line) => line.includes(LIVE_API_KEY_ENV_VAR))).toBe(true);
    });

    it('--live with multiple --proxy flags: warns which proxies are NOT live-verified, still verifies the first', async () => {
      const adapters: Record<string, FakeAdapter> = {
        rtk: new FakeAdapter('rtk', { baseline: () => 'x'.repeat(100), compressed: () => 'x'.repeat(60) }),
        'lean-ctx': new FakeAdapter('lean-ctx', { baseline: () => 'x'.repeat(100), compressed: () => 'x'.repeat(40) }),
      };
      const liveApiClient = vi.fn(async (taskId: string): Promise<LiveApiCall> => ({ taskId, billedInputTokens: 42 }));
      const outcome = await runVerify(
        baseOptions({ proxies: ['rtk', 'lean-ctx'], live: true, confirmCost: true, liveMaxTasks: 25 }),
        baseDeps({
          getAdapter: (name) => adapters[name]!,
          liveApiClient,
          env: { [LIVE_API_KEY_ENV_VAR]: 'sk-real-looking-key' },
        }),
      );

      expect(outcome.exitCode).toBe(0);
      expect(liveApiClient).toHaveBeenCalled();
      expect(
        printed.some(
          (line) => line.includes('--live only verifies the first proxy (rtk)') && line.includes('lean-ctx'),
        ),
      ).toBe(true);
    });
  });

  describe(
    'CRITICAL: proxy execution failure path (regression -- a failed compress invocation must never be ' +
      'reported as an implausible ~100% reduction)',
    () => {
      it('exits 1 with a readable error and produces NO report when the compress command fails', async () => {
        class FailingCompressAdapter implements ProxyAdapter {
          readonly name = 'rtk' as const;
          readonly binaryName = 'rtk';
          readonly installCommand = 'echo install';
          async isInstalled(): Promise<boolean> {
            return true;
          }
          async getVersion(): Promise<string> {
            return '2.4.1';
          }
          async run(task: Task, mode: 'compressed' | 'baseline'): Promise<AdapterResult> {
            if (mode === 'baseline') {
              return { rawOutput: 'token '.repeat(50), proxyVersion: '2.4.1', durationMs: 1 };
            }
            throw new ProxyExecutionError('rtk', 'rtk', ['compress', '--stdin'], 2, 'unrecognized argument --stdin');
          }
        }

        const outcome = await runVerify(baseOptions(), baseDeps({ getAdapter: () => new FailingCompressAdapter() }));

        expect(outcome.exitCode).toBe(1);
        expect(outcome.report).toBeUndefined();
        expect(printed.some((line) => line.startsWith('Error:') && line.includes('exited with code 2'))).toBe(true);
        // No printed line should contain a fabricated 100%-style reduction summary.
        expect(printed.some((line) => line.includes('TokenTrust v0.1'))).toBe(false);
      });
    },
  );

  describe(
    'CRITICAL: proxy execution failure surfaced from TT03 (never-worse guard also must not swallow a ' +
      'failed compress invocation)',
    () => {
      it('exits 1 with a readable error when TT03 (not TT01) is the call that hits the failing compress command', async () => {
        const tasksPath = join(repoDir, 'one-task.yml');
        writeFileSync(
          tasksPath,
          [
            'version: 1',
            'tasks:',
            '  - id: has-markers',
            '    description: "d"',
            '    fixture_repo: .',
            '    prompt: "p"',
            '    difficulty: easy',
            '    quality_markers:',
            '      - "marker"',
          ].join('\n'),
          'utf8',
        );

        let compressedCalls = 0;
        class TransientlyFailingAdapter implements ProxyAdapter {
          readonly name = 'rtk' as const;
          readonly binaryName = 'rtk';
          readonly installCommand = 'echo install';
          async isInstalled(): Promise<boolean> {
            return true;
          }
          async getVersion(): Promise<string> {
            return '2.4.1';
          }
          async run(task: Task, mode: 'compressed' | 'baseline'): Promise<AdapterResult> {
            if (mode === 'baseline') {
              return { rawOutput: 'token '.repeat(50), proxyVersion: '2.4.1', durationMs: 1 };
            }
            compressedCalls += 1;
            // First compressed call is TT01's -- let it succeed so TT01/TT02
            // complete normally. TT03's compressed call (triggered by this
            // task's quality_markers) is the one that fails.
            if (compressedCalls === 1) {
              return { rawOutput: 'token '.repeat(20), proxyVersion: '2.4.1', durationMs: 1 };
            }
            throw new ProxyExecutionError('rtk', 'rtk', ['compress', '--stdin'], 1, 'transient failure');
          }
        }

        const outcome = await runVerify(
          baseOptions({ tasksPath }),
          baseDeps({ getAdapter: () => new TransientlyFailingAdapter() }),
        );

        expect(outcome.exitCode).toBe(1);
        expect(outcome.report).toBeUndefined();
        expect(printed.some((line) => line.startsWith('Error:') && line.includes('transient failure'))).toBe(true);
      });
    },
  );

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

  describe('headroom: v0.1 CLI-level not-yet-supported gate (Decision 2)', () => {
    it('--proxy headroom alone: exits 1 with the documented message, never constructs the headroom adapter', async () => {
      const getAdapter = vi.fn((name: ProxyName) =>
        new FakeAdapter(name, { baseline: () => '', compressed: () => '' }),
      );
      const outcome = await runVerify(baseOptions({ proxies: ['headroom'] }), baseDeps({ getAdapter }));

      expect(outcome.exitCode).toBe(1);
      expect(outcome.report).toBeUndefined();
      expect(getAdapter).not.toHaveBeenCalledWith('headroom');
      expect(printed.some((line) => line.includes('HTTP proxy server') && line.toLowerCase().includes('not yet'))).toBe(
        true,
      );
    });

    it('--proxy rtk --proxy headroom: rtk still verifies and produces a report; headroom prints its message but does not block', async () => {
      const getAdapter = vi.fn((name: ProxyName) =>
        name === 'rtk'
          ? new FakeAdapter('rtk', { baseline: () => 'token '.repeat(50), compressed: () => 'token '.repeat(20) })
          : new FakeAdapter(name, { baseline: () => '', compressed: () => '' }),
      );
      const outcome = await runVerify(baseOptions({ proxies: ['rtk', 'headroom'] }), baseDeps({ getAdapter }));

      expect(outcome.exitCode).toBe(0);
      expect(outcome.report).toBeDefined();
      expect(outcome.report?.proxies).toEqual(['rtk']);
      expect(getAdapter).not.toHaveBeenCalledWith('headroom');
      expect(printed.some((line) => line.toLowerCase().includes('not yet'))).toBe(true);
    });
  });
});
