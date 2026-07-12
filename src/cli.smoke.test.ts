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

  it('actually runs when invoked as `node dist/cli.js` and exits non-zero (proves real subprocess execution)', () => {
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

    // This assertion is deliberately environment-agnostic: on a machine with
    // no rtk binary on PATH (CI, most dev machines), the missing-binary path
    // fires. On a machine that happens to have a real rtk binary installed,
    // rtk's actual CLI has no generic "compress arbitrary stdin text"
    // command matching what this adapter invokes, so the compress command
    // exits non-zero and ProxyExecutionError fires instead (see
    // src/adapters/base.ts) -- this is the exact real-world path that
    // reproduced a false ~100%-reduction bug found during manual
    // end-to-end testing of the compiled CLI, before that fix.
    // Either way, exit code 1 with a real, non-empty error message proves
    // the CLI actually executed end-to-end rather than silently no-op'ing.
    expect(exitCode).toBe(1);
    expect(
      stdout.includes('not found on PATH. Install:') ||
        stdout.includes('Refusing to report a compression ratio computed from a failed rtk run'),
    ).toBe(true);
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

  it(
    'runs `node dist/cli.js verify --help` and prints clean usage, exiting 0 -- regression for a bug found ' +
      'during manual end-to-end testing of the compiled CLI, where this threw an unhandled ' +
      'ERR_PARSE_ARGS_UNKNOWN_OPTION Node stack trace instead of printing ' +
      "usage, because node:util's parseArgs() is strict by default and --help was never declared in its " +
      'options schema. Only a real subprocess invocation exercises this -- unit tests calling parseCliFlags() ' +
      'or main() directly never go through the compiled binary the way a user actually invokes it.',
    () => {
      let stdout = '';
      let stderr = '';
      let exitCode = 0;
      try {
        stdout = execFileSync(process.execPath, [distCliPath, 'verify', '--help'], { encoding: 'utf8' });
      } catch (err) {
        const e = err as { status: number; stdout: string; stderr: string };
        exitCode = e.status;
        stdout = e.stdout;
        stderr = e.stderr;
      }

      expect(exitCode).toBe(0);
      expect(stdout).toContain('tokentrust verify');
      expect(stdout).toContain('--proxy');
      expect(stdout).toContain('tokentrust verify --proxy rtk');
      expect(stderr).not.toContain('ERR_PARSE_ARGS_UNKNOWN_OPTION');
      expect(stderr).not.toContain('at Object.parseArgs');
    },
  );

  it('runs `node dist/cli.js --help` (top-level) and prints usage, exiting 0', () => {
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    try {
      stdout = execFileSync(process.execPath, [distCliPath, '--help'], { encoding: 'utf8' });
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      exitCode = e.status;
      stdout = e.stdout;
      stderr = e.stderr;
    }

    expect(exitCode).toBe(0);
    expect(stdout).toContain('tokentrust');
    expect(stdout).toContain('verify');
    expect(stderr).not.toContain('ERR_PARSE_ARGS_UNKNOWN_OPTION');
  });
});
