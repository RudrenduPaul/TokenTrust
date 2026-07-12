import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../tasks/types.js';

const spawnCaptureMock = vi.fn();
vi.mock('./spawn-utils.js', () => ({
  spawnCapture: (...args: unknown[]) => spawnCaptureMock(...args),
  isEnoent: (err: unknown) =>
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT',
}));

const { RtkAdapter } = await import('./rtk.js');

describe('RtkAdapter dual invocation (rtk pipe --filter vs rtk read -l aggressive)', () => {
  let dir: string;

  beforeEach(() => {
    spawnCaptureMock.mockReset();
    dir = mkdtempSync(join(tmpdir(), 'tokentrust-rtk-adapter-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('filter tasks (rtk pipe --filter)', () => {
    it('invokes `rtk pipe --filter <filter>` over stdin with the raw captured context, not `rtk read`', async () => {
      mkdirSync(join(dir, 'repo'), { recursive: true });
      writeFileSync(join(dir, 'repo', 'captured-output.txt'), 'a\tb\nc\td\n', 'utf8');
      const task: Task = {
        id: 'filter-task',
        description: 'd',
        fixture_repo: './repo',
        prompt: 'p',
        difficulty: 'easy',
        filter: 'git-log',
        fixtureRepoAbsolutePath: join(dir, 'repo'),
      };

      spawnCaptureMock.mockImplementation((_bin: string, args: string[]) => {
        if (args[0] === 'pipe') return Promise.resolve({ stdout: 'compressed', stderr: '', code: 0 });
        return Promise.resolve({ stdout: 'rtk 0.43.0', stderr: '', code: 0 });
      });

      const adapter = new RtkAdapter();
      const result = await adapter.run(task, 'compressed');

      expect(result.rawOutput).toBe('compressed');
      const pipeCall = spawnCaptureMock.mock.calls.find((c) => (c[1] as string[])[0] === 'pipe');
      expect(pipeCall?.[1]).toEqual(['pipe', '--filter', 'git-log']);
      expect(pipeCall?.[2]).toBe('a\tb\nc\td\n');
    });

    it('surfaces ProxyExecutionError with the real `pipe --filter` args when the invocation fails', async () => {
      mkdirSync(join(dir, 'repo'), { recursive: true });
      writeFileSync(join(dir, 'repo', 'captured-output.txt'), 'x', 'utf8');
      const task: Task = {
        id: 'filter-task',
        description: 'd',
        fixture_repo: './repo',
        prompt: 'p',
        difficulty: 'easy',
        filter: 'vitest',
        fixtureRepoAbsolutePath: join(dir, 'repo'),
      };
      spawnCaptureMock.mockImplementation((_bin: string, args: string[]) => {
        if (args[0] === 'pipe') return Promise.resolve({ stdout: '', stderr: 'bad filter', code: 1 });
        return Promise.resolve({ stdout: 'rtk 0.43.0', stderr: '', code: 0 });
      });
      const adapter = new RtkAdapter();
      await expect(adapter.run(task, 'compressed')).rejects.toThrow(/pipe --filter vitest/);
    });
  });

  describe('file-based tasks (rtk read -l aggressive, no filter)', () => {
    it('invokes `rtk read -l aggressive <files>` with real absolute file paths, no stdin', async () => {
      mkdirSync(join(dir, 'repo'), { recursive: true });
      writeFileSync(join(dir, 'repo', 'a.js'), 'const a = 1;', 'utf8');
      writeFileSync(join(dir, 'repo', 'b.js'), 'const b = 2;', 'utf8');
      const task: Task = {
        id: 'file-task',
        description: 'd',
        fixture_repo: './repo',
        prompt: 'p',
        difficulty: 'easy',
        fixtureRepoAbsolutePath: join(dir, 'repo'),
      };

      spawnCaptureMock.mockImplementation((_bin: string, args: string[]) => {
        if (args[0] === 'read') return Promise.resolve({ stdout: 'compressed files', stderr: '', code: 0 });
        return Promise.resolve({ stdout: 'rtk 0.43.0', stderr: '', code: 0 });
      });

      const adapter = new RtkAdapter();
      const result = await adapter.run(task, 'compressed');

      expect(result.rawOutput).toBe('compressed files');
      const readCall = spawnCaptureMock.mock.calls.find((c) => (c[1] as string[])[0] === 'read');
      expect(readCall?.[1]).toEqual(['read', '-l', 'aggressive', join(dir, 'repo', 'a.js'), join(dir, 'repo', 'b.js')]);
      expect(readCall?.[2]).toBeUndefined();
    });
  });
});
