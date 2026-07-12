import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeAdapter, makeTask } from '../test-support/fake-adapter.js';
import { evaluateNeverWorseGuard, runTt03 } from './tt03_never_worse_guard.js';

const TESTDATA_DIR = join(process.cwd(), 'src', 'categories', 'testdata', 'tt03');

function readFixture(dir: string): { compressed: string; requiredMarkers: string[] } {
  const compressed = readFileSync(join(TESTDATA_DIR, dir, 'compressed.txt'), 'utf8');
  const { requiredMarkers } = JSON.parse(readFileSync(join(TESTDATA_DIR, dir, 'markers.json'), 'utf8'));
  return { compressed, requiredMarkers };
}

describe('evaluateNeverWorseGuard (pure)', () => {
  it('PASS (testdata/tt03/clean): all required markers survive compression', () => {
    const { compressed, requiredMarkers } = readFixture('clean');
    const result = evaluateNeverWorseGuard('clean-task', compressed, requiredMarkers);
    expect(result.regressed).toBe(false);
    expect(result.missingMarkers).toEqual([]);
  });

  it('FAIL (testdata/tt03/vulnerable): a required marker is missing from compressed output', () => {
    const { compressed, requiredMarkers } = readFixture('vulnerable');
    const result = evaluateNeverWorseGuard('vulnerable-task', compressed, requiredMarkers);
    expect(result.regressed).toBe(true);
    expect(result.missingMarkers.length).toBeGreaterThan(0);
    expect(result.missingMarkers).toContain('function calculateTotal');
  });
});

describe('runTt03 (end to end over a task list)', () => {
  it('reports pass: true when no task has a regression', async () => {
    const { compressed, requiredMarkers } = readFixture('clean');
    const adapter = new FakeAdapter('rtk', { baseline: () => '', compressed: () => compressed });
    const task = makeTask({ quality_markers: requiredMarkers });
    const result = await runTt03(adapter, [task]);

    expect(result.pass).toBe(true);
    expect(result.regressedCount).toBe(0);
    expect(result.taskCorpusSize).toBe(1);
  });

  it('reports pass: false when any task regresses', async () => {
    const { compressed, requiredMarkers } = readFixture('vulnerable');
    const adapter = new FakeAdapter('rtk', { baseline: () => '', compressed: () => compressed });
    const task = makeTask({ quality_markers: requiredMarkers });
    const result = await runTt03(adapter, [task]);

    expect(result.pass).toBe(false);
    expect(result.regressedCount).toBe(1);
  });

  it('treats a task with no quality_markers as a no-op (never a regression) and never invokes the adapter for it', async () => {
    const adapter = new FakeAdapter('rtk', { baseline: () => '', compressed: () => 'anything' });
    const task = makeTask(); // no quality_markers
    const result = await runTt03(adapter, [task]);

    expect(result.pass).toBe(true);
    expect(adapter.callLog).toHaveLength(0);
  });

  it('invokes onProgress once per task', async () => {
    const { compressed, requiredMarkers } = readFixture('clean');
    const adapter = new FakeAdapter('rtk', { baseline: () => '', compressed: () => compressed });
    const calls: Array<[number, number]> = [];
    await runTt03(
      adapter,
      [makeTask({ id: 'a', quality_markers: requiredMarkers }), makeTask({ id: 'b', quality_markers: requiredMarkers })],
      (done, total) => calls.push([done, total]),
    );
    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});
