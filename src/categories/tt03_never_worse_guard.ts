import type { ProxyAdapter } from '../adapters/types.js';
import type { Task } from '../tasks/types.js';
import { count } from '../tokenizer/index.js';

export interface Tt03TaskResult {
  taskId: string;
  regressed: boolean;
  missingMarkers: string[];
  /** True when the compressed output has MORE tokens than the raw baseline -- a real expansion, not a compression. */
  tokenCountRegressed: boolean;
  rawTokens: number;
  compressedTokens: number;
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
 * TT03 Never-Worse Output Guard -- checks two independent ways a proxy's
 * compressed output can be worse than the raw input:
 *
 * 1. Content loss: does compression drop content the task's fixture marks
 *    as required to survive (task.quality_markers, the additive TT03 schema
 *    extension documented in CONTRIBUTING.md). A task with no
 *    quality_markers defined skips this half of the check (nothing to
 *    check) -- CONTRIBUTING.md's "how to add a fixture task" step 4
 *    documents adding markers for tasks meant to exercise it.
 * 2. Token-count expansion: does "compression" actually make the output
 *    BIGGER than the raw baseline it started from -- a real, previously
 *    undetected regression class (a filter that expands instead of
 *    compresses still passed TT03 before this check existed, as long as it
 *    happened to keep every required marker). This half runs on every task
 *    regardless of quality_markers, using the same tokenizer TT01 uses, so
 *    it is directly comparable to TT01's own reduction percentage.
 *
 * A task is regressed if either half fails.
 *
 * A PASS here means the current task corpus did not detect a regression on
 * this run -- [redacted] anti-sycophancy rule 6 -- it is not a general
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
    const baseline = await adapter.run(task, 'baseline');
    const compressed = await adapter.run(task, 'compressed');
    perTask.push(evaluateNeverWorseGuard(task.id, baseline.rawOutput, compressed.rawOutput, markers));
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

/** Pure function: given raw baseline text, compressed output text, and the markers that must survive, decide PASS/FAIL on both content-loss and token-count-expansion grounds. */
export function evaluateNeverWorseGuard(
  taskId: string,
  rawOutput: string,
  compressedOutput: string,
  requiredMarkers: string[],
): Tt03TaskResult {
  const missingMarkers = requiredMarkers.filter((marker) => !compressedOutput.includes(marker));
  const rawTokens = count(rawOutput).tokens;
  const compressedTokens = count(compressedOutput).tokens;
  const tokenCountRegressed = compressedTokens > rawTokens;
  return {
    taskId,
    regressed: missingMarkers.length > 0 || tokenCountRegressed,
    missingMarkers,
    tokenCountRegressed,
    rawTokens,
    compressedTokens,
  };
}
