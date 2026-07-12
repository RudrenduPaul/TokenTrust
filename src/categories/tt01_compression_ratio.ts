import type { ProxyAdapter } from '../adapters/types.js';
import type { Task } from '../tasks/types.js';
import { count } from '../tokenizer/index.js';

export interface Tt01TaskResult {
  taskId: string;
  tokensBefore: number;
  tokensAfter: number;
  reductionPct: number;
  skipped: boolean;
  skipReason?: string;
}

export interface Tt01Result {
  category: 'TT01';
  claimedSavingsPct: number | null;
  measuredSavingsPct: number;
  perTask: Tt01TaskResult[];
  taskCorpusSize: number;
}

export type ProgressCallback = (done: number, total: number) => void;

/**
 * TT01 Compression Ratio Verification -- measures actual context-token
 * reduction on a labeled task corpus with a real local tokenizer, compared
 * against the proxy's own claimed/marketed reduction percentage.
 *
 * Named failure path (eng-review): if the tokenizer flags a task's before or
 * after text as malformed/non-UTF8, that task is skipped with a WARN and the
 * batch continues -- it never crashes the run.
 */
export async function runTt01(
  adapter: ProxyAdapter,
  tasks: Task[],
  claimedSavingsPct: number | null,
  onProgress?: ProgressCallback,
): Promise<Tt01Result> {
  const perTask: Tt01TaskResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    const baseline = await adapter.run(task, 'baseline');
    const compressed = await adapter.run(task, 'compressed');
    const before = count(baseline.rawOutput);
    const after = count(compressed.rawOutput);

    if (before.skipped || after.skipped) {
      // tokenizer.count() always sets `reason` when skipped is true (see
      // src/tokenizer/index.ts) -- the 'unknown' fallback is defensive-only
      // and not reachable through the public count() contract.
      /* v8 ignore next */
      const reason = (before.skipped ? before.reason : after.reason) ?? 'unknown';
      console.warn(`[WARN] TT01: skipping task "${task.id}" -- ${reason}`);
      perTask.push({
        taskId: task.id,
        tokensBefore: 0,
        tokensAfter: 0,
        reductionPct: 0,
        skipped: true,
        skipReason: reason,
      });
    } else {
      const reductionPct = before.tokens === 0 ? 0 : ((before.tokens - after.tokens) / before.tokens) * 100;
      perTask.push({
        taskId: task.id,
        tokensBefore: before.tokens,
        tokensAfter: after.tokens,
        reductionPct,
        skipped: false,
      });
    }

    onProgress?.(i + 1, tasks.length);
  }

  const counted = perTask.filter((t) => !t.skipped);
  const measuredSavingsPct = counted.length
    ? counted.reduce((sum, t) => sum + t.reductionPct, 0) / counted.length
    : 0;

  return {
    category: 'TT01',
    claimedSavingsPct,
    measuredSavingsPct,
    perTask,
    taskCorpusSize: tasks.length,
  };
}

/** Pure helper: computes reduction% directly from token counts, no adapter/tokenizer calls. */
export function computeReductionPct(tokensBefore: number, tokensAfter: number): number {
  if (tokensBefore === 0) return 0;
  return ((tokensBefore - tokensAfter) / tokensBefore) * 100;
}

export function computeAverage(perTask: Tt01TaskResult[]): number {
  const counted = perTask.filter((t) => !t.skipped);
  if (counted.length === 0) return 0;
  return counted.reduce((sum, t) => sum + t.reductionPct, 0) / counted.length;
}
