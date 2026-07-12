import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../tasks/types.js';
import { MissingBinaryError } from './types.js';

const spawnCaptureMock = vi.fn();
vi.mock('./spawn-utils.js', () => ({
  spawnCapture: (...args: unknown[]) => spawnCaptureMock(...args),
  isEnoent: (err: unknown) =>
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT',
}));

// Imported after the mock is registered so RtkAdapter (via BaseAdapter) picks up the mocked module.
const { RtkAdapter } = await import('./rtk.js');

function enoentError(): Error {
  return Object.assign(new Error('spawn rtk ENOENT'), { code: 'ENOENT' });
}

describe('BaseAdapter (exercised via RtkAdapter)', () => {
  let dir: string;
  let task: Task;

  beforeEach(() => {
    spawnCaptureMock.mockReset();
    dir = mkdtempSync(join(tmpdir(), 'tokentrust-adapter-'));
    mkdirSync(join(dir, 'repo'), { recursive: true });
    writeFileSync(join(dir, 'repo', 'main.js'), 'const x = 1;', 'utf8');
    task = {
      id: 't1',
      description: 'd',
      fixture_repo: './repo',
      prompt: 'do the thing',
      difficulty: 'easy',
      fixtureRepoAbsolutePath: join(dir, 'repo'),
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('isInstalled() returns true when the version probe succeeds', async () => {
    spawnCaptureMock.mockResolvedValueOnce({ stdout: 'rtk 2.4.1', stderr: '', code: 0 });
    const adapter = new RtkAdapter();
    await expect(adapter.isInstalled()).resolves.toBe(true);
  });

  it('isInstalled() returns false when the binary is missing (ENOENT)', async () => {
    spawnCaptureMock.mockRejectedValueOnce(enoentError());
    const adapter = new RtkAdapter();
    await expect(adapter.isInstalled()).resolves.toBe(false);
  });

  it('getVersion() extracts a semver-looking version from stdout and caches it', async () => {
    spawnCaptureMock.mockResolvedValueOnce({ stdout: 'rtk 2.4.1', stderr: '', code: 0 });
    const adapter = new RtkAdapter();
    await expect(adapter.getVersion()).resolves.toBe('2.4.1');
    await expect(adapter.getVersion()).resolves.toBe('2.4.1');
    expect(spawnCaptureMock).toHaveBeenCalledTimes(1); // cached on second call
  });

  it('getVersion() falls back to "unknown" when stdout has no version-looking substring', async () => {
    spawnCaptureMock.mockResolvedValueOnce({ stdout: 'no version here', stderr: '', code: 0 });
    const adapter = new RtkAdapter();
    await expect(adapter.getVersion()).resolves.toBe('unknown');
  });

  it('getVersion() returns "not-installed" when the binary is missing', async () => {
    spawnCaptureMock.mockRejectedValueOnce(enoentError());
    const adapter = new RtkAdapter();
    await expect(adapter.getVersion()).resolves.toBe('not-installed');
  });

  it('run(baseline) returns the raw fixture context without invoking the compress command', async () => {
    spawnCaptureMock.mockResolvedValue({ stdout: 'rtk 2.4.1', stderr: '', code: 0 });
    const adapter = new RtkAdapter();
    const result = await adapter.run(task, 'baseline');
    expect(result.rawOutput).toContain('const x = 1;');
    expect(result.rawOutput).toContain('do the thing');
    expect(result.proxyVersion).toBe('2.4.1');
    // Only the version probe should have run, never a compress call.
    expect(spawnCaptureMock).toHaveBeenCalledTimes(1);
    expect(spawnCaptureMock.mock.calls[0]?.[1]).toEqual(['--version']);
  });

  it('run(compressed) spawns the compress command and returns its stdout', async () => {
    spawnCaptureMock.mockImplementation((_bin: string, args: string[]) => {
      if (args[0] === 'compress') {
        return Promise.resolve({ stdout: 'compressed output', stderr: '', code: 0 });
      }
      return Promise.resolve({ stdout: 'rtk 2.4.1', stderr: '', code: 0 });
    });
    const adapter = new RtkAdapter();
    const result = await adapter.run(task, 'compressed');
    expect(result.rawOutput).toBe('compressed output');
    expect(result.proxyVersion).toBe('2.4.1');
  });

  it(
    'run(compressed) throws MissingBinaryError with the locked verbatim message when the binary is missing (CRITICAL)',
    async () => {
      spawnCaptureMock.mockRejectedValue(enoentError());
      const adapter = new RtkAdapter();
      await expect(adapter.run(task, 'compressed')).rejects.toThrow(MissingBinaryError);
      await expect(adapter.run(task, 'compressed')).rejects.toThrow(
        'rtk not found on PATH. Install: curl -fsSL https://rtk-ai.app/install.sh | sh  (or: cargo install rtk). Then re-run this command.',
      );
    },
  );
});
