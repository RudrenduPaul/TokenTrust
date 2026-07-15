import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendRun,
  findLatestRun,
  loadReportStore,
  runTt05,
  writeReportStore,
} from './tt05_version_drift.js';
import type { ReportStore } from './tt05_version_drift.js';

const TESTDATA_DIR = join(process.cwd(), 'src', 'categories', 'testdata', 'tt05');

describe('loadReportStore + runTt05 -- testdata/tt05/clean (valid store, prior run present)', () => {
  it('finds the prior run and reports no regression when savings held steady', () => {
    const loaded = loadReportStore(join(TESTDATA_DIR, 'clean', 'report-store.json'));
    expect(loaded.corrupted).toBe(false);
    expect(loaded.existed).toBe(true);

    const result = runTt05(loaded, 'rtk', '/fixtures/repo', 39.6);
    expect(result.pass).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.priorRunId).toBe('tt_2026-07-04_9a31be');
    expect(result.message).toContain('No regression');
  });

  it('reports a regression when measured savings drop more than the threshold vs. the prior baseline', () => {
    const loaded = loadReportStore(join(TESTDATA_DIR, 'clean', 'report-store.json'));
    // Prior measured 41.0%; a drop to 20% is a 21-point regression, well past the 5-point threshold.
    const result = runTt05(loaded, 'rtk', '/fixtures/repo', 20);
    expect(result.pass).toBe(false);
    expect(result.message).toContain('Regression');
  });

  it('returns no prior baseline for a proxy/repo combination not in the store', () => {
    const loaded = loadReportStore(join(TESTDATA_DIR, 'clean', 'report-store.json'));
    const result = runTt05(loaded, 'headroom', '/fixtures/repo', 30);
    expect(result.pass).toBe(true);
    expect(result.priorRunId).toBeNull();
    expect(result.message).toContain('No prior verified baseline');
  });
});

describe('loadReportStore + runTt05 -- testdata/tt05/vulnerable (corrupted store, CRITICAL: graceful degradation)', () => {
  it('degrades to "no drift comparison available" instead of throwing when the store is corrupted', () => {
    const loaded = loadReportStore(join(TESTDATA_DIR, 'vulnerable', 'report-store.json'));
    expect(loaded.corrupted).toBe(true);
    expect(loaded.existed).toBe(true);

    expect(() => runTt05(loaded, 'rtk', '/fixtures/repo', 39.6)).not.toThrow();
    const result = runTt05(loaded, 'rtk', '/fixtures/repo', 39.6);
    expect(result.degraded).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.priorRunId).toBeNull();
    expect(result.message).toContain('No drift comparison available');
  });
});

describe('loadReportStore -- valid JSON but wrong shape (still corruption, distinct from invalid JSON syntax)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tokentrust-store-shape-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('treats valid JSON without a "runs" array as corrupted', () => {
    const path = join(dir, 'report-store.json');
    writeFileSync(path, JSON.stringify({ notRuns: [] }), 'utf8');
    const loaded = loadReportStore(path);
    expect(loaded.corrupted).toBe(true);
    expect(loaded.existed).toBe(true);
  });

  it('treats a valid JSON array (not an object) as corrupted', () => {
    const path = join(dir, 'report-store.json');
    writeFileSync(path, JSON.stringify([1, 2, 3]), 'utf8');
    const loaded = loadReportStore(path);
    expect(loaded.corrupted).toBe(true);
  });

  it('treats JSON null as corrupted', () => {
    const path = join(dir, 'report-store.json');
    writeFileSync(path, 'null', 'utf8');
    const loaded = loadReportStore(path);
    expect(loaded.corrupted).toBe(true);
  });
});

describe('loadReportStore -- missing file (expected on first run, not corruption)', () => {
  it('returns an empty store with existed: false, corrupted: false', () => {
    const loaded = loadReportStore('/definitely/does/not/exist/report-store.json');
    expect(loaded.existed).toBe(false);
    expect(loaded.corrupted).toBe(false);
    expect(loaded.store.runs).toEqual([]);
  });
});

describe('findLatestRun', () => {
  it('returns the most recent run for a given proxy/repo pair', () => {
    const store = {
      runs: [
        {
          runId: 'r1',
          timestamp: '2026-01-01T00:00:00.000Z',
          proxy: 'rtk' as const,
          proxyVersion: '2.0.0',
          repo: 'repo-a',
          measuredSavingsPct: 10,
          priorRunId: null,
        },
        {
          runId: 'r2',
          timestamp: '2026-06-01T00:00:00.000Z',
          proxy: 'rtk' as const,
          proxyVersion: '2.4.0',
          repo: 'repo-a',
          measuredSavingsPct: 20,
          priorRunId: 'r1',
        },
        {
          runId: 'r3',
          timestamp: '2026-06-15T00:00:00.000Z',
          proxy: 'headroom' as const,
          proxyVersion: '1.0.0',
          repo: 'repo-a',
          measuredSavingsPct: 30,
          priorRunId: null,
        },
      ],
    };
    expect(findLatestRun(store, 'rtk', 'repo-a')?.runId).toBe('r2');
    expect(findLatestRun(store, 'headroom', 'repo-a')?.runId).toBe('r3');
    expect(findLatestRun(store, 'rtk', 'repo-b')).toBeUndefined();
  });
});

describe('appendRun + writeReportStore + loadReportStore round-trip', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tokentrust-store-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a store to a nested path, creating directories, and reads it back identically', () => {
    const path = join(dir, 'nested', 'report-store.json');
    expect(existsSync(path)).toBe(false);

    let store: ReportStore = { runs: [] };
    store = appendRun(store, {
      runId: 'r1',
      timestamp: '2026-07-11T00:00:00.000Z',
      proxy: 'rtk',
      proxyVersion: '2.4.1',
      repo: 'my-repo',
      measuredSavingsPct: 39.6,
      priorRunId: null,
    });
    writeReportStore(path, store);

    expect(existsSync(path)).toBe(true);
    const reloaded = loadReportStore(path);
    expect(reloaded.corrupted).toBe(false);
    expect(reloaded.store.runs).toHaveLength(1);
    expect(reloaded.store.runs[0]!.runId).toBe('r1');

    const raw = readFileSync(path, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
