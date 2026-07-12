import type { AdapterResult, ProxyAdapter, ProxyName } from '../adapters/types.js';
import type { Task } from '../tasks/types.js';

export interface FakeAdapterScript {
  baseline: (task: Task) => string;
  compressed: (task: Task) => string;
}

/**
 * Test double for ProxyAdapter -- lets category-level tests control exactly
 * what "baseline" and "compressed" text a task produces without spawning a
 * real proxy binary. installed defaults to true; set to false to exercise
 * the missing-binary path from category code that checks isInstalled().
 */
export class FakeAdapter implements ProxyAdapter {
  readonly name: ProxyName;
  readonly binaryName: string;
  readonly installCommand = 'echo "fake adapter has no real install command"';
  installed = true;
  version = '1.0.0';
  callLog: Array<{ taskId: string; mode: 'compressed' | 'baseline' }> = [];

  constructor(
    name: ProxyName,
    private readonly script: FakeAdapterScript,
  ) {
    this.name = name;
    this.binaryName = name;
  }

  async isInstalled(): Promise<boolean> {
    return this.installed;
  }

  async getVersion(): Promise<string> {
    return this.version;
  }

  async run(task: Task, mode: 'compressed' | 'baseline'): Promise<AdapterResult> {
    this.callLog.push({ taskId: task.id, mode });
    const rawOutput = mode === 'baseline' ? this.script.baseline(task) : this.script.compressed(task);
    return { rawOutput, proxyVersion: this.version, durationMs: 1 };
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    description: 'a fixture task',
    fixture_repo: '.',
    prompt: 'do the thing',
    difficulty: 'easy',
    fixtureRepoAbsolutePath: process.cwd(),
    ...overrides,
  };
}
