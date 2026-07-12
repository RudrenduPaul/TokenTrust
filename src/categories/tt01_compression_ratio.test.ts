import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeAdapter, makeTask } from '../test-support/fake-adapter.js';
import { computeAverage, computeReductionPct, runTt01 } from './tt01_compression_ratio.js';

const TESTDATA_DIR = join(process.cwd(), 'src', 'categories', 'testdata', 'tt01');

function readClaimed(dir: string): { pct: number; label: string } {
  return JSON.parse(readFileSync(join(TESTDATA_DIR, dir, 'claimed.json'), 'utf8'));
}

describe('computeReductionPct (pure)', () => {
  it('computes the percentage reduction from token counts', () => {
    expect(computeReductionPct(100, 50)).toBe(50);
    expect(computeReductionPct(100, 100)).toBe(0);
    expect(computeReductionPct(100, 0)).toBe(100);
  });

  it('returns 0 rather than dividing by zero when tokensBefore is 0', () => {
    expect(computeReductionPct(0, 0)).toBe(0);
  });
});

describe('runTt01 -- testdata/tt01/clean (measured close to claimed)', () => {
  it('measures a reduction close to the claimed figure using real fixture text', async () => {
    const before = readFileSync(join(TESTDATA_DIR, 'clean', 'before.txt'), 'utf8');
    const after = readFileSync(join(TESTDATA_DIR, 'clean', 'after.txt'), 'utf8');
    const claimed = readClaimed('clean');

    const adapter = new FakeAdapter('rtk', { baseline: () => before, compressed: () => after });
    const result = await runTt01(adapter, [makeTask()], claimed.pct);

    expect(result.measuredSavingsPct).toBeGreaterThan(0);
    // "Clean" fixture: the real measured reduction should land within a wide
    // but meaningful band around the claimed figure -- proving the category
    // logic reports numbers close to claims when the claim roughly holds,
    // computed from the actual tokenizer run above, not hand-typed.
    expect(Math.abs(result.measuredSavingsPct - claimed.pct)).toBeLessThan(30);
  });
});

describe('runTt01 -- testdata/tt01/vulnerable (measured far below claimed -- gap detected)', () => {
  it('measures a reduction far below the claimed figure using real fixture text', async () => {
    const before = readFileSync(join(TESTDATA_DIR, 'vulnerable', 'before.txt'), 'utf8');
    const after = readFileSync(join(TESTDATA_DIR, 'vulnerable', 'after.txt'), 'utf8');
    const claimed = readClaimed('vulnerable');

    const adapter = new FakeAdapter('rtk', { baseline: () => before, compressed: () => after });
    const result = await runTt01(adapter, [makeTask()], claimed.pct);

    // "Vulnerable" fixture: after.txt is nearly identical to before.txt, so
    // the measured reduction should be far below the (much higher) claim --
    // this is the gap-detection case the category exists to catch.
    expect(result.measuredSavingsPct).toBeLessThan(claimed.pct / 2);
  });
});

describe('runTt01 -- named failure path: malformed tokenizer input (CRITICAL)', () => {
  it('skips a task with a WARN instead of crashing the batch when adapter output is malformed', async () => {
    const goodTask = makeTask({ id: 'good-task' });
    const badTask = makeTask({ id: 'bad-task' });

    const adapter = new FakeAdapter('rtk', {
      baseline: (task) => (task.id === 'bad-task' ? 'valid � broken' : 'The quick brown fox jumps.'),
      compressed: () => 'short',
    });

    const result = await runTt01(adapter, [goodTask, badTask], 50);

    expect(result.perTask).toHaveLength(2);
    const badResult = result.perTask.find((t) => t.taskId === 'bad-task')!;
    expect(badResult.skipped).toBe(true);
    expect(badResult.skipReason).toMatch(/malformed|non-UTF8/i);
    expect(badResult.reductionPct).toBe(0);

    const goodResult = result.perTask.find((t) => t.taskId === 'good-task')!;
    expect(goodResult.skipped).toBe(false);

    // The batch must complete for every task, not throw.
    expect(result.taskCorpusSize).toBe(2);
  });

  it('skips a task when only the compressed side is malformed (baseline stays valid)', async () => {
    const adapter = new FakeAdapter('rtk', {
      baseline: () => 'The quick brown fox jumps over the lazy dog.',
      compressed: (task) => (task.id === 'bad-task' ? 'valid � broken' : 'short'),
    });
    const result = await runTt01(adapter, [makeTask({ id: 'bad-task' })], 50);
    expect(result.perTask[0]!.skipped).toBe(true);
  });

  it('treats a zero-token (empty) baseline as a valid, non-skipped 0% reduction task', async () => {
    const adapter = new FakeAdapter('rtk', { baseline: () => '', compressed: () => '' });
    const result = await runTt01(adapter, [makeTask()], null);
    expect(result.perTask[0]!.skipped).toBe(false);
    expect(result.perTask[0]!.tokensBefore).toBe(0);
    expect(result.perTask[0]!.reductionPct).toBe(0);
  });

  it('excludes skipped tasks from the averaged measuredSavingsPct', async () => {
    const adapter = new FakeAdapter('rtk', {
      baseline: (task) => (task.id === 'bad' ? '�' : 'The quick brown fox jumps over the lazy dog.'),
      compressed: (task) => (task.id === 'bad' ? '�' : 'The quick brown fox.'),
    });
    const result = await runTt01(adapter, [makeTask({ id: 'good' }), makeTask({ id: 'bad' })], null);
    expect(result.perTask.filter((t) => t.skipped)).toHaveLength(1);
    expect(result.measuredSavingsPct).toBeGreaterThan(0);
  });
});

describe('computeAverage (pure)', () => {
  it('averages only non-skipped tasks', () => {
    const avg = computeAverage([
      { taskId: 'a', tokensBefore: 10, tokensAfter: 5, reductionPct: 50, skipped: false },
      { taskId: 'b', tokensBefore: 0, tokensAfter: 0, reductionPct: 0, skipped: true, skipReason: 'x' },
      { taskId: 'c', tokensBefore: 10, tokensAfter: 0, reductionPct: 100, skipped: false },
    ]);
    expect(avg).toBe(75);
  });

  it('returns 0 for an empty or fully-skipped list', () => {
    expect(computeAverage([])).toBe(0);
    expect(
      computeAverage([{ taskId: 'a', tokensBefore: 0, tokensAfter: 0, reductionPct: 0, skipped: true }]),
    ).toBe(0);
  });
});

describe('runTt01 -- progress callback', () => {
  it('invokes onProgress once per task with (done, total)', async () => {
    const adapter = new FakeAdapter('rtk', { baseline: () => 'hello world', compressed: () => 'hi' });
    const calls: Array<[number, number]> = [];
    await runTt01(adapter, [makeTask({ id: 'a' }), makeTask({ id: 'b' })], null, (done, total) =>
      calls.push([done, total]),
    );
    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});
