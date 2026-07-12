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
 * Locked error message format (user-confirmed verbatim):
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
