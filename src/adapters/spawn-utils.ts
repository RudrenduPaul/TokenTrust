import { spawn } from 'node:child_process';

export interface SpawnCaptureResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface SpawnCaptureOptions {
  /** Kill the child and reject if it hasn't exited within this many ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

// Env var NAMES matching this are dropped before the child process is
// spawned -- rtk/headroom are third-party binaries this project doesn't
// control, and without this they'd otherwise inherit every secret sitting
// in the parent's environment (NPM_TOKEN, PYPI_TOKEN, GITHUB_TOKEN,
// ANTHROPIC_API_KEY, ...) on every single call, not just --live mode.
const SENSITIVE_ENV_NAME_PATTERN = /token|secret|key|password|passwd|credential/i;

function scrubEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const scrubbed: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || SENSITIVE_ENV_NAME_PATTERN.test(name)) continue;
    scrubbed[name] = value;
  }
  return scrubbed;
}

/**
 * Shared child_process.spawn wrapper used by every proxy adapter. Node's
 * built-in spawn is deliberately the only process-spawning mechanism used
 * here -- three adapters don't justify pulling in execa or another process
 * wrapper.
 *
 * Rejects with the raw spawn error (e.g. ENOENT when the binary isn't on
 * PATH) so callers can distinguish "not installed" from "ran and failed."
 * Also rejects (rather than hanging forever) if the child doesn't exit
 * within timeoutMs, and never hands the child the parent's full
 * environment -- see scrubEnv above.
 */
export function spawnCapture(
  binary: string,
  args: string[],
  input?: string,
  options?: SpawnCaptureOptions,
): Promise<SpawnCaptureResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    let timedOut = false;
    const child = spawn(binary, args, { env: scrubEnv(process.env) });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Process "${binary}" timed out after ${timeoutMs}ms and was killed.`));
        return;
      }
      resolvePromise({ stdout, stderr, code });
    });

    if (input !== undefined) {
      child.stdin?.write(input, 'utf8');
    }
    child.stdin?.end();
  });
}

export function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'ENOENT';
}
