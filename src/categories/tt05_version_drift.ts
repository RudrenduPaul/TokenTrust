import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProxyName } from '../adapters/types.js';

export interface ReportStoreRun {
  runId: string;
  timestamp: string;
  proxy: ProxyName;
  proxyVersion: string;
  repo: string;
  measuredSavingsPct: number;
  priorRunId: string | null;
}

export interface ReportStore {
  runs: ReportStoreRun[];
}

export const DEFAULT_STORE_PATH = '.tokentrust/report-store.json';
/** A drop of more than this many percentage points vs. the prior baseline counts as a regression. */
export const DEFAULT_REGRESSION_THRESHOLD_PCT = 5;

export interface LoadedStore {
  store: ReportStore;
  corrupted: boolean;
  existed: boolean;
}

/**
 * Named failure path: a missing or corrupted store must degrade to "no
 * drift comparison available," not crash TT05. Missing is expected on a
 * repo's first run (existed: false, corrupted: false); corrupted (existed:
 * true, corrupted: true) means the file was present but not valid JSON /
 * not the expected shape.
 */
export function loadReportStore(path: string): LoadedStore {
  if (!existsSync(path)) {
    return { store: { runs: [] }, corrupted: false, existed: false };
  }

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { runs?: unknown }).runs)
    ) {
      throw new Error('report store is missing a valid "runs" array');
    }
    return { store: parsed as ReportStore, corrupted: false, existed: true };
  } catch {
    return { store: { runs: [] }, corrupted: true, existed: true };
  }
}

export function findLatestRun(
  store: ReportStore,
  proxy: ProxyName,
  repo: string,
): ReportStoreRun | undefined {
  const matches = store.runs.filter((r) => r.proxy === proxy && r.repo === repo);
  if (matches.length === 0) return undefined;
  return matches.reduce((latest, run) =>
    new Date(run.timestamp).getTime() > new Date(latest.timestamp).getTime() ? run : latest,
  );
}

export interface Tt05Result {
  category: 'TT05';
  pass: boolean;
  message: string;
  priorRunId: string | null;
  /** True when this result came from a graceful-degradation path (store missing/corrupted). */
  degraded: boolean;
}

/**
 * TT05 Version-Drift Regression Detection -- compares this run's measured
 * savings against the last-verified baseline for the same proxy/repo pair,
 * chained via prior_run_id. Directly targets the rtk#582/#1935-style
 * failure pattern: a proxy silently getting worse after a version bump.
 */
export function runTt05(
  loaded: LoadedStore,
  proxy: ProxyName,
  repo: string,
  measuredSavingsPct: number,
  regressionThresholdPct: number = DEFAULT_REGRESSION_THRESHOLD_PCT,
): Tt05Result {
  if (loaded.corrupted) {
    console.warn('[WARN] TT05: report store is corrupted or unreadable -- no drift comparison available.');
    return {
      category: 'TT05',
      pass: true,
      message:
        'No drift comparison available -- the local report store was corrupted or unreadable. ' +
        'This run establishes a fresh measurement history.',
      priorRunId: null,
      degraded: true,
    };
  }

  const prior = findLatestRun(loaded.store, proxy, repo);
  if (!prior) {
    return {
      category: 'TT05',
      pass: true,
      message: `No prior verified baseline for ${proxy} on this repo -- this run establishes the first baseline.`,
      priorRunId: null,
      degraded: false,
    };
  }

  const delta = measuredSavingsPct - prior.measuredSavingsPct;
  const regressed = delta < -regressionThresholdPct;
  const storedDate = prior.timestamp.slice(0, 10);
  const message = regressed
    ? `Regression vs. last-verified ${proxy} ${prior.proxyVersion} baseline (stored ${storedDate}): ` +
      `measured savings dropped from ${prior.measuredSavingsPct.toFixed(1)}% to ${measuredSavingsPct.toFixed(1)}%.`
    : `No regression vs. last-verified ${proxy} ${prior.proxyVersion} baseline (stored ${storedDate}).`;

  return {
    category: 'TT05',
    pass: !regressed,
    message,
    priorRunId: prior.runId,
    degraded: false,
  };
}

export function appendRun(store: ReportStore, run: ReportStoreRun): ReportStore {
  return { runs: [...store.runs, run] };
}

export function writeReportStore(path: string, store: ReportStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf8');
}
