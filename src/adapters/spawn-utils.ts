import { spawn } from 'node:child_process';

export interface SpawnCaptureResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Shared child_process.spawn wrapper used by every proxy adapter. Node's
 * built-in spawn is deliberately the only process-spawning mechanism used
 * here -- three adapters don't justify pulling in execa or another process
 * wrapper.
 *
 * Rejects with the raw spawn error (e.g. ENOENT when the binary isn't on
 * PATH) so callers can distinguish "not installed" from "ran and failed."
 */
export function spawnCapture(
  binary: string,
  args: string[],
  input?: string,
): Promise<SpawnCaptureResult> {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const child = spawn(binary, args);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
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
