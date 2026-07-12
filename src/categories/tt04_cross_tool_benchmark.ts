import type { ProxyName } from '../adapters/types.js';
import type { Tt01Result } from './tt01_compression_ratio.js';

export class CorpusMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorpusMismatchError';
  }
}

export interface Tt04ProxyResult {
  proxy: ProxyName;
  measuredSavingsPct: number;
  taskIds: string[];
}

export interface Tt04Result {
  category: 'TT04';
  results: Tt04ProxyResult[];
  taskCorpusSize: number;
}

/**
 * TT04 Cross-Tool Comparative Benchmark -- runs the identical task corpus
 * through every supported proxy side by side. [redacted] anti-sycophancy
 * rule 4: a cross-tool comparison is only valid if every compared proxy ran
 * the exact same labeled tasks -- this throws rather than silently
 * comparing non-identical corpora.
 */
export function assertIdenticalCorpora(perProxyTaskIds: Array<{ proxy: ProxyName; taskIds: string[] }>): void {
  if (perProxyTaskIds.length < 2) return;

  const first = perProxyTaskIds[0]!;
  const firstSet = new Set(first.taskIds);

  for (const entry of perProxyTaskIds.slice(1)) {
    const set = new Set(entry.taskIds);
    const identical = set.size === firstSet.size && [...set].every((id) => firstSet.has(id));
    if (!identical) {
      throw new CorpusMismatchError(
        `TT04 cross-tool comparison requires an identical task corpus across all compared proxies. ` +
          `"${entry.proxy}" ran a different task corpus than "${first.proxy}".`,
      );
    }
  }
}

export function runTt04(perProxyResults: Array<{ proxy: ProxyName; tt01: Tt01Result }>): Tt04Result {
  const perProxyTaskIds = perProxyResults.map((r) => ({
    proxy: r.proxy,
    taskIds: r.tt01.perTask.map((t) => t.taskId),
  }));
  assertIdenticalCorpora(perProxyTaskIds);

  const results: Tt04ProxyResult[] = perProxyResults.map((r) => ({
    proxy: r.proxy,
    measuredSavingsPct: r.tt01.measuredSavingsPct,
    taskIds: r.tt01.perTask.map((t) => t.taskId),
  }));

  return {
    category: 'TT04',
    results,
    taskCorpusSize: perProxyResults[0]?.tt01.taskCorpusSize ?? 0,
  };
}
