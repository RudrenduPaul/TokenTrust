import { execFileSync, execSync } from 'node:child_process';
import { existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

  it('actually runs when invoked as `node dist/cli.js` (proves real subprocess execution, not a no-op)', () => {
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

    // Environment-agnostic across three real outcomes for `--proxy rtk`:
    // (a) no rtk binary on PATH -> missing-binary message, exit 1;
    // (b) rtk installed but its compress invocation fails for some other
    //     reason -> ProxyExecutionError message, exit 1 (this was the exact
    //     path that reproduced the live-audit's false ~100%-reduction bug
    //     before that fix, and predates the rtk adapter rewrite below);
    // (c) rtk installed and the adapter's real `pipe --filter` / `read -l
    //     aggressive` invocation succeeds -> a real TT01 report prints and
    //     the process exits 0. All three prove the CLI actually executed
    //     end-to-end rather than silently no-op'ing (the no-op failure mode
    //     prints nothing and exits 0 with empty stdout, which none of these
    //     three branches allow).
    const missingBinary = stdout.includes('not found on PATH. Install:');
    const compressFailed = stdout.includes('Refusing to report a compression ratio computed from a failed rtk run');
    const realReport = exitCode === 0 && stdout.includes('TT01 Compression Ratio');
    expect(missingBinary || compressFailed || realReport).toBe(true);
    if (realReport) {
      expect(exitCode).toBe(0);
    } else {
      expect(exitCode).toBe(1);
    }
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
    'runs `node dist/cli.js verify --help` and prints clean usage, exiting 0 -- regression for a live-audit ' +
      'bug where this threw an unhandled ERR_PARSE_ARGS_UNKNOWN_OPTION Node stack trace instead of printing ' +
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

  it('runs correctly when invoked through a symlink whose target differs from process.argv[1] (regression: import.meta.url canonicalizes to the symlink target, so a naive pathToFileURL(process.argv[1]) comparison silently no-ops)', () => {
    const linkPath = join(tmpdir(), `tokentrust-cli-symlink-test-${process.pid}.mjs`);
    try {
      symlinkSync(distCliPath, linkPath);
    } catch {
      return; // symlinks unsupported in this environment (e.g. some Windows CI runners) -- skip rather than fail
    }
    try {
      let stdout = '';
      let exitCode = 0;
      try {
        stdout = execFileSync(process.execPath, [linkPath, '--help'], { encoding: 'utf8' });
      } catch (err) {
        const e = err as { status: number; stdout: string };
        exitCode = e.status;
        stdout = e.stdout;
      }
      expect(exitCode).toBe(0);
      expect(stdout).toContain('tokentrust');
      expect(stdout.length).toBeGreaterThan(0);
    } finally {
      rmSync(linkPath, { force: true });
    }
  });

});
