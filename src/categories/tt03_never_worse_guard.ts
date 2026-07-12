import type { ProxyAdapter } from '../adapters/types.js';
import type { Task } from '../tasks/types.js';

export interface Tt03TaskResult {
  taskId: string;
  regressed: boolean;
  missingMarkers: string[];
}

export interface Tt03Result {
  category: 'TT03';
  pass: boolean;
  regressedCount: number;
  taskCorpusSize: number;
  perTask: Tt03TaskResult[];
}

export type ProgressCallback = (done: number, total: number) => void;

/**
 * TT03 Never-Worse Output Guard -- checks whether a proxy's compressed
 * output ever drops content the task's fixture marks as required to survive
 * compression (task.quality_markers, the additive TT03 schema extension
 * documented in CONTRIBUTING.md).
 *
 * A task with no quality_markers defined is a no-op for this guard (nothing
 * to check, never counted as a regression) -- CONTRIBUTING.md's "how to add
 * a fixture task" step 4 documents adding markers for tasks meant to
 * exercise this category.
 *
 * A PASS here means the current task corpus did not detect a regression on
 * this run -- CLAUDE.md anti-sycophancy rule 6 -- it is not a general
 * guarantee, and every terminal/JSON report states this limitation
 * (see src/report/terminal.ts).
 */
export async function runTt03(
  adapter: ProxyAdapter,
  tasks: Task[],
  onProgress?: ProgressCallback,
): Promise<Tt03Result> {
  const perTask: Tt03TaskResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    const markers = task.quality_markers ?? [];
    if (markers.length === 0) {
      perTask.push({ taskId: task.id, regressed: false, missingMarkers: [] });
    } else {
      const compressed = await adapter.run(task, 'compressed');
      perTask.push(evaluateNeverWorseGuard(task.id, compressed.rawOutput, markers));
    }
    onProgress?.(i + 1, tasks.length);
  }

  const regressedCount = perTask.filter((t) => t.regressed).length;

  return {
    category: 'TT03',
    pass: regressedCount === 0,
    regressedCount,
    taskCorpusSize: tasks.length,
    perTask,
  };
}

/** Pure function: given compressed output text and the markers that must survive, decide PASS/FAIL. */
export function evaluateNeverWorseGuard(
  taskId: string,
  compressedOutput: string,
  requiredMarkers: string[],
): Tt03TaskResult {
  const missingMarkers = requiredMarkers.filter((marker) => !compressedOutput.includes(marker));
  return { taskId, regressed: missingMarkers.length > 0, missingMarkers };
}
