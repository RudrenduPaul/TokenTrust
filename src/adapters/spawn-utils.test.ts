import { describe, expect, it } from 'vitest';
import { isEnoent, spawnCapture } from './spawn-utils.js';

describe('spawnCapture', () => {
  it('captures stdout from a real child process', async () => {
    const { stdout, code } = await spawnCapture(process.execPath, ['-e', 'process.stdout.write("hello")']);
    expect(stdout).toBe('hello');
    expect(code).toBe(0);
  });

  it('captures stdin input piped to the child process', async () => {
    const { stdout } = await spawnCapture(
      process.execPath,
      ['-e', 'process.stdin.on("data", (d) => process.stdout.write(d.toString().toUpperCase()))'],
      'hello',
    );
    expect(stdout).toBe('HELLO');
  });

  it('rejects with an ENOENT-shaped error when the binary does not exist', async () => {
    await expect(spawnCapture('tokentrust-definitely-not-a-real-binary', [])).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('captures a non-zero exit code without rejecting', async () => {
    const { code } = await spawnCapture(process.execPath, ['-e', 'process.exit(3)']);
    expect(code).toBe(3);
  });
});

describe('isEnoent', () => {
  it('returns true for an error with code ENOENT', () => {
    expect(isEnoent(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isEnoent(new Error('x'))).toBe(false);
    expect(isEnoent(null)).toBe(false);
    expect(isEnoent('not an object')).toBe(false);
  });
});
