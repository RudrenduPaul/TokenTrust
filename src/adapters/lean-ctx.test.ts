import { describe, expect, it, vi } from 'vitest';

const spawnCaptureMock = vi.fn();
vi.mock('./spawn-utils.js', () => ({
  spawnCapture: (...args: unknown[]) => spawnCaptureMock(...args),
  isEnoent: (err: unknown) =>
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT',
}));

const { LeanCtxAdapter } = await import('./lean-ctx.js');

describe('LeanCtxAdapter', () => {
  it('carries the install command for the missing-binary error', () => {
    const adapter = new LeanCtxAdapter();
    expect(adapter.binaryName).toBe('lean-ctx');
    expect(adapter.name).toBe('lean-ctx');
    expect(adapter.installCommand).toContain('lean-ctx');
  });

  it('isInstalled() reflects the version probe result', async () => {
    spawnCaptureMock.mockReset();
    spawnCaptureMock.mockResolvedValueOnce({ stdout: 'lean-ctx 0.9.1', stderr: '', code: 0 });
    const adapter = new LeanCtxAdapter();
    await expect(adapter.isInstalled()).resolves.toBe(true);
  });

  it('missing-binary error matches the locked verbatim format', async () => {
    spawnCaptureMock.mockReset();
    spawnCaptureMock.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    const adapter = new LeanCtxAdapter();
    const task = {
      id: 't1',
      description: 'd',
      fixture_repo: '.',
      prompt: 'p',
      difficulty: 'easy' as const,
      fixtureRepoAbsolutePath: process.cwd(),
    };
    await expect(adapter.run(task, 'compressed')).rejects.toThrow(
      `lean-ctx not found on PATH. Install: ${adapter.installCommand}. Then re-run this command.`,
    );
  });
});
