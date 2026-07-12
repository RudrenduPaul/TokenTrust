import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeAdapter, makeTask } from '../test-support/fake-adapter.js';
import { evaluateNeverWorseGuard, runTt03 } from './tt03_never_worse_guard.js';

const TESTDATA_DIR = join(process.cwd(), 'src', 'categories', 'testdata', 'tt03');

function readFixture(dir: string): { raw: string; compressed: string; requiredMarkers: string[] } {
  const raw = readFileSync(join(TESTDATA_DIR, dir, 'raw.txt'), 'utf8');
  const compressed = readFileSync(join(TESTDATA_DIR, dir, 'compressed.txt'), 'utf8');
  const { requiredMarkers } = JSON.parse(readFileSync(join(TESTDATA_DIR, dir, 'markers.json'), 'utf8'));
  return { raw, compressed, requiredMarkers };
}

describe('evaluateNeverWorseGuard (pure)', () => {
  it('PASS (testdata/tt03/clean): all required markers survive compression and output shrinks', () => {
    const { raw, compressed, requiredMarkers } = readFixture('clean');
    const result = evaluateNeverWorseGuard('clean-task', raw, compressed, requiredMarkers);
    expect(result.regressed).toBe(false);
    expect(result.missingMarkers).toEqual([]);
    expect(result.tokenCountRegressed).toBe(false);
    expect(result.compressedTokens).toBeLessThan(result.rawTokens);
  });

  it('FAIL (testdata/tt03/vulnerable): a required marker is missing from compressed output', () => {
    const { raw, compressed, requiredMarkers } = readFixture('vulnerable');
    const result = evaluateNeverWorseGuard('vulnerable-task', raw, compressed, requiredMarkers);
    expect(result.regressed).toBe(true);
    expect(result.missingMarkers.length).toBeGreaterThan(0);
    expect(result.missingMarkers).toContain('function calculateTotal');
  });

  it('FAIL (testdata/tt03/expanded): every required marker survives, but compressed output is larger than raw', () => {
    const { raw, compressed, requiredMarkers } = readFixture('expanded');
    const result = evaluateNeverWorseGuard('expanded-task', raw, compressed, requiredMarkers);
    expect(result.missingMarkers).toEqual([]); // markers alone would say PASS
    expect(result.tokenCountRegressed).toBe(true);
    expect(result.compressedTokens).toBeGreaterThan(result.rawTokens);
    expect(result.regressed).toBe(true); // token-count check catches what the marker check alone would miss
  });
});

describe('runTt03 (end to end over a task list)', () => {
  it('reports pass: true when no task has a regression', async () => {
    const { raw, compressed, requiredMarkers } = readFixture('clean');
    const adapter = new FakeAdapter('rtk', { baseline: () => raw, compressed: () => compressed });
    const task = makeTask({ quality_markers: requiredMarkers });
    const result = await runTt03(adapter, [task]);

    expect(result.pass).toBe(true);
    expect(result.regressedCount).toBe(0);
    expect(result.taskCorpusSize).toBe(1);
  });

  it('reports pass: false when any task regresses on missing markers', async () => {
    const { raw, compressed, requiredMarkers } = readFixture('vulnerable');
    const adapter = new FakeAdapter('rtk', { baseline: () => raw, compressed: () => compressed });
    const task = makeTask({ quality_markers: requiredMarkers });
    const result = await runTt03(adapter, [task]);

    expect(result.pass).toBe(false);
    expect(result.regressedCount).toBe(1);
  });

  it('reports pass: false when a task regresses on token-count expansion alone (no missing markers)', async () => {
    const { raw, compressed, requiredMarkers } = readFixture('expanded');
    const adapter = new FakeAdapter('rtk', { baseline: () => raw, compressed: () => compressed });
    const task = makeTask({ quality_markers: requiredMarkers });
    const result = await runTt03(adapter, [task]);

    expect(result.pass).toBe(false);
    expect(result.regressedCount).toBe(1);
    expect(result.perTask[0]?.missingMarkers).toEqual([]);
    expect(result.perTask[0]?.tokenCountRegressed).toBe(true);
  });

  it('a task with no quality_markers still runs the token-count-expansion check (markers are optional, the expansion check is not)', async () => {
    const adapter = new FakeAdapter('rtk', { baseline: () => 'short raw text', compressed: () => 'short raw text plus a lot more content that makes this much longer than the original' });
    const task = makeTask(); // no quality_markers
    const result = await runTt03(adapter, [task]);

    expect(result.pass).toBe(false);
    expect(result.perTask[0]?.tokenCountRegressed).toBe(true);
    expect(adapter.callLog.length).toBeGreaterThan(0);
  });

  it('invokes onProgress once per task', async () => {
    const { raw, compressed, requiredMarkers } = readFixture('clean');
    const adapter = new FakeAdapter('rtk', { baseline: () => raw, compressed: () => compressed });
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
