import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildReportRecord, generateRunId, serializeReport, writeReport } from './json.js';
import type { FullReport } from './types.js';

describe('generateRunId', () => {
  it('matches the documented run_id shape: tt_YYYY-MM-DD_<hex>', () => {
    const id = generateRunId(new Date('2026-07-11T09:14:52Z'));
    expect(id).toMatch(/^tt_2026-07-11_[0-9a-f]{6}$/);
  });

  it('generates a different id on each call (random suffix)', () => {
    const now = new Date('2026-07-11T00:00:00Z');
    const a = generateRunId(now);
    const b = generateRunId(now);
    expect(a).not.toBe(b);
  });
});

describe('buildReportRecord -- matches the ReportRecord schema', () => {
  it('produces every locked field, rounds measured_savings_pct to 2 decimals', () => {
    const record = buildReportRecord({
      runId: 'tt_2026-07-11_4f2a9c',
      timestamp: '2026-07-11T09:14:52Z',
      proxy: 'rtk',
      proxyVersion: '2.4.1',
      repo: 'my-repo',
      category: 'TT02',
      claimedSavingsPct: 70,
      measuredSavingsPct: 39.5999,
      taskCorpusSize: 12,
      priorRunId: 'tt_2026-07-04_9a31be',
    });

    expect(record).toEqual({
      run_id: 'tt_2026-07-11_4f2a9c',
      timestamp: '2026-07-11T09:14:52Z',
      proxy: 'rtk',
      proxy_version: '2.4.1',
      repo: 'my-repo',
      category: 'TT02',
      claimed_savings_pct: 70,
      measured_savings_pct: 39.6,
      task_corpus_size: 12,
      prior_run_id: 'tt_2026-07-04_9a31be',
    });
  });

  it('allows claimed_savings_pct: null and prior_run_id: null', () => {
    const record = buildReportRecord({
      runId: 'r1',
      timestamp: '2026-01-01T00:00:00Z',
      proxy: 'headroom',
      proxyVersion: '1.0.0',
      repo: 'repo',
      category: 'TT01',
      claimedSavingsPct: null,
      measuredSavingsPct: 10,
      taskCorpusSize: 5,
      priorRunId: null,
    });
    expect(record.claimed_savings_pct).toBeNull();
    expect(record.prior_run_id).toBeNull();
  });
});

describe('serializeReport / writeReport', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tokentrust-report-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function sampleReport(): FullReport {
    return {
      run_id: 'tt_2026-07-11_4f2a9c',
      timestamp: '2026-07-11T09:14:52Z',
      repo: 'my-repo',
      task_corpus_size: 12,
      proxies: ['rtk'],
      records: [],
      tt03: {},
      tt05: {},
    };
  }

  it('serializes to pretty-printed, parseable JSON', () => {
    const json = serializeReport(sampleReport());
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).toContain('\n');
  });

  it('writes the report to disk and round-trips through JSON.parse', () => {
    const path = join(dir, 'tokentrust-report-2026-07-11.json');
    writeReport(sampleReport(), path);
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    expect(parsed.run_id).toBe('tt_2026-07-11_4f2a9c');
  });
});
