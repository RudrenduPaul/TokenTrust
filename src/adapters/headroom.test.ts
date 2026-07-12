import { describe, expect, it, vi } from 'vitest';

const spawnCaptureMock = vi.fn();
vi.mock('./spawn-utils.js', () => ({
  spawnCapture: (...args: unknown[]) => spawnCaptureMock(...args),
  isEnoent: (err: unknown) =>
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT',
}));

const { HeadroomAdapter } = await import('./headroom.js');

describe('HeadroomAdapter', () => {
  it('carries the pip install command for the missing-binary error', () => {
    const adapter = new HeadroomAdapter();
    expect(adapter.installCommand).toBe('pip install headroom-ai');
    expect(adapter.binaryName).toBe('headroom');
    expect(adapter.name).toBe('headroom');
  });

  it('isInstalled() reflects the version probe result', async () => {
    spawnCaptureMock.mockReset();
    spawnCaptureMock.mockResolvedValueOnce({ stdout: 'headroom 1.2.0', stderr: '', code: 0 });
    const adapter = new HeadroomAdapter();
    await expect(adapter.isInstalled()).resolves.toBe(true);
  });

  it('missing-binary error matches the locked verbatim format', async () => {
    spawnCaptureMock.mockReset();
    spawnCaptureMock.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    const adapter = new HeadroomAdapter();
    const task = {
      id: 't1',
      description: 'd',
      fixture_repo: '.',
      prompt: 'p',
      difficulty: 'easy' as const,
      fixtureRepoAbsolutePath: process.cwd(),
    };
    await expect(adapter.run(task, 'compressed')).rejects.toThrow(
      'headroom not found on PATH. Install: pip install headroom-ai. Then re-run this command.',
    );
  });
});
