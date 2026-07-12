import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Regression coverage for a real bug caught during the build pass: comparing
// import.meta.url to a naively-concatenated `file://${process.argv[1]}`
// breaks on any path containing a space (or other URL-reserved character),
// silently making the CLI's "am I the entry point" check false and turning
// every invocation into a no-op that exits 0 with no output. Unit tests that
// import cli.ts's exported functions directly can never catch this, because
// they never go through the process.argv[1]-vs-import.meta.url comparison
// path -- only actually spawning the compiled CLI as a subprocess does.
const distCliPath = join(process.cwd(), 'dist', 'cli.js');

describe('compiled CLI entry point (subprocess smoke test)', () => {
  beforeAll(() => {
    if (!existsSync(distCliPath)) {
      execSync('npm run build', { cwd: process.cwd(), stdio: 'inherit' });
    }
  }, 60_000);

  it('actually runs when invoked as `node dist/cli.js` and exits non-zero with the locked missing-binary message', () => {
    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execFileSync(process.execPath, [distCliPath, 'verify', '--proxy', 'rtk'], {
        encoding: 'utf8',
      });
    } catch (err) {
      const e = err as { status: number; stdout: string };
      exitCode = e.status;
      stdout = e.stdout;
    }

    // rtk is not expected to be installed in this environment (CI or dev
    // machine without the proxy binaries) -- the missing-binary path is
    // exactly what should fire, proving the CLI actually executed.
    expect(exitCode).toBe(1);
    expect(stdout).toContain('not found on PATH. Install:');
    expect(stdout).toContain('Then re-run this command.');
  });

  it('prints a usage error and exits 1 when --proxy is omitted', () => {
    let stderr = '';
    let exitCode = 0;
    try {
      execFileSync(process.execPath, [distCliPath, 'verify'], { encoding: 'utf8' });
    } catch (err) {
      const e = err as { status: number; stderr: string };
      exitCode = e.status;
      stderr = e.stderr;
    }
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--proxy is required');
  });
});
