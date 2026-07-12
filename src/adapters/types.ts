import type { Task } from '../tasks/types.js';

export type ProxyName = 'rtk' | 'headroom' | 'lean-ctx';

export interface AdapterResult {
  /** Exact text that would reach the LLM for this task/mode. */
  rawOutput: string;
  /** Installed proxy version, used for TT05 version-drift tracking. */
  proxyVersion: string;
  durationMs: number;
}

export interface ProxyAdapter {
  readonly name: ProxyName;
  readonly binaryName: string;
  /** Human-readable install instructions, shown in the missing-binary error. */
  readonly installCommand: string;
  isInstalled(): Promise<boolean>;
  getVersion(): Promise<string>;
  run(task: Task, mode: 'compressed' | 'baseline'): Promise<AdapterResult>;
}

/**
 * Locked error message format ([redacted], user-confirmed verbatim):
 * "<proxy> not found on PATH. Install: <install command>. Then re-run this command."
 */
export class MissingBinaryError extends Error {
  readonly proxyName: ProxyName;
  readonly binaryName: string;
  readonly installCommand: string;

  constructor(proxyName: ProxyName, binaryName: string, installCommand: string) {
    super(`${binaryName} not found on PATH. Install: ${installCommand}. Then re-run this command.`);
    this.name = 'MissingBinaryError';
    this.proxyName = proxyName;
    this.binaryName = binaryName;
    this.installCommand = installCommand;
  }
}

/**
 * Thrown when a proxy's compress command runs (the binary is on PATH and
 * spawns) but exits non-zero. Before this existed, BaseAdapter.run() blindly
 * trusted whatever came back on stdout -- even from a failed invocation --
 * as the "compressed" text. A failed run (e.g. a rejected flag, a crash, a
 * transient error) typically prints nothing or an error message to stdout,
 * which the tokenizer then counts as near-zero tokens, making TT01 report
 * an implausible ~100% reduction that reads as "even better than promised"
 * when it is actually a broken measurement. Failing loudly here, instead of
 * silently reporting that fabricated number, is what [redacted]
 * Anti-Sycophancy Rule #1 requires ("never state a measured number without
 * the command that produced it actually succeeding").
 */
export class ProxyExecutionError extends Error {
  readonly proxyName: ProxyName;
  readonly exitCode: number | null;

  constructor(proxyName: ProxyName, binaryName: string, args: string[], exitCode: number | null, stderr: string) {
    const codeLabel = exitCode === null ? 'was terminated by a signal' : `exited with code ${exitCode}`;
    const stderrSuffix = stderr.trim() ? ` stderr: ${stderr.trim()}` : ' (no stderr output)';
    super(
      `${binaryName} ${args.join(' ')} ${codeLabel} instead of compressing successfully.${stderrSuffix} ` +
        `Refusing to report a compression ratio computed from a failed ${binaryName} run.`,
    );
    this.name = 'ProxyExecutionError';
    this.proxyName = proxyName;
    this.exitCode = exitCode;
  }
}
