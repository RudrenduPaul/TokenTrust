import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProxyName } from '../adapters/types.js';
import type { Tt01Result, Tt01TaskResult } from './tt01_compression_ratio.js';
import { CorpusMismatchError, assertIdenticalCorpora, runTt04 } from './tt04_cross_tool_benchmark.js';

const TESTDATA_DIR = join(process.cwd(), 'src', 'categories', 'testdata', 'tt04');

function readCorpus(dir: string, file: string): { proxy: ProxyName; taskIds: string[] } {
  return JSON.parse(readFileSync(join(TESTDATA_DIR, dir, file), 'utf8'));
}

function tt01ResultFromTaskIds(taskIds: string[], measuredSavingsPct: number): Tt01Result {
  const perTask: Tt01TaskResult[] = taskIds.map((taskId) => ({
    taskId,
    tokensBefore: 100,
    tokensAfter: 60,
    reductionPct: 40,
    skipped: false,
  }));
  return { category: 'TT01', claimedSavingsPct: null, measuredSavingsPct, perTask, taskCorpusSize: taskIds.length };
}

describe('assertIdenticalCorpora + runTt04 -- testdata/tt04/clean (identical corpora)', () => {
  it('does not throw when every compared proxy ran the same task ids', () => {
    const a = readCorpus('clean', 'corpus-a.json');
    const b = readCorpus('clean', 'corpus-b.json');
    expect(() =>
      assertIdenticalCorpora([
        { proxy: a.proxy, taskIds: a.taskIds },
        { proxy: b.proxy, taskIds: b.taskIds },
      ]),
    ).not.toThrow();
  });

  it('runTt04 aggregates measured savings per proxy from the identical corpora', () => {
    const a = readCorpus('clean', 'corpus-a.json');
    const b = readCorpus('clean', 'corpus-b.json');
    const result = runTt04([
      { proxy: a.proxy, tt01: tt01ResultFromTaskIds(a.taskIds, 41.2) },
      { proxy: b.proxy, tt01: tt01ResultFromTaskIds(b.taskIds, 44.8) },
    ]);
    expect(result.results).toEqual([
      { proxy: 'rtk', measuredSavingsPct: 41.2, taskIds: a.taskIds },
      { proxy: 'headroom', measuredSavingsPct: 44.8, taskIds: b.taskIds },
    ]);
    expect(result.taskCorpusSize).toBe(a.taskIds.length);
  });
});

describe('assertIdenticalCorpora + runTt04 -- testdata/tt04/vulnerable (mismatched corpora, CRITICAL: must error)', () => {
  it('throws CorpusMismatchError when compared proxies ran different task ids', () => {
    const a = readCorpus('vulnerable', 'corpus-a.json');
    const b = readCorpus('vulnerable', 'corpus-b.json');
    expect(() =>
      assertIdenticalCorpora([
        { proxy: a.proxy, taskIds: a.taskIds },
        { proxy: b.proxy, taskIds: b.taskIds },
      ]),
    ).toThrow(CorpusMismatchError);
  });

  it('runTt04 propagates the CorpusMismatchError rather than silently comparing mismatched corpora', () => {
    const a = readCorpus('vulnerable', 'corpus-a.json');
    const b = readCorpus('vulnerable', 'corpus-b.json');
    expect(() =>
      runTt04([
        { proxy: a.proxy, tt01: tt01ResultFromTaskIds(a.taskIds, 40) },
        { proxy: b.proxy, tt01: tt01ResultFromTaskIds(b.taskIds, 50) },
      ]),
    ).toThrow(/identical task corpus/);
  });
});

describe('assertIdenticalCorpora -- single proxy is trivially valid', () => {
  it('does not throw when only one proxy is being compared', () => {
    expect(() => assertIdenticalCorpora([{ proxy: 'rtk', taskIds: ['a', 'b'] }])).not.toThrow();
    expect(() => assertIdenticalCorpora([])).not.toThrow();
  });
});

describe('runTt04 -- empty input edge case', () => {
  it('returns taskCorpusSize: 0 rather than throwing when given an empty result list', () => {
    const result = runTt04([]);
    expect(result.results).toEqual([]);
    expect(result.taskCorpusSize).toBe(0);
  });
});
