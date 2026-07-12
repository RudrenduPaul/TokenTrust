import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { CategoryId, FullReport, ReportRecord } from './types.js';
import type { ProxyName } from '../adapters/types.js';

/** Matches the [redacted] example run_id shape: tt_2026-07-11_4f2a9c */
export function generateRunId(now: Date = new Date()): string {
  const datePart = now.toISOString().slice(0, 10);
  const randomPart = randomBytes(3).toString('hex');
  return `tt_${datePart}_${randomPart}`;
}

export interface BuildRecordInput {
  runId: string;
  timestamp: string;
  proxy: ProxyName;
  proxyVersion: string;
  repo: string;
  category: CategoryId;
  claimedSavingsPct: number | null;
  measuredSavingsPct: number;
  taskCorpusSize: number;
  priorRunId: string | null;
}

export function buildReportRecord(input: BuildRecordInput): ReportRecord {
  return {
    run_id: input.runId,
    timestamp: input.timestamp,
    proxy: input.proxy,
    proxy_version: input.proxyVersion,
    repo: input.repo,
    category: input.category,
    claimed_savings_pct: input.claimedSavingsPct,
    measured_savings_pct: roundTo(input.measuredSavingsPct, 2),
    task_corpus_size: input.taskCorpusSize,
    prior_run_id: input.priorRunId,
  };
}

export function serializeReport(report: FullReport): string {
  return JSON.stringify(report, null, 2);
}

export function writeReport(report: FullReport, outPath: string): void {
  writeFileSync(outPath, serializeReport(report), 'utf8');
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
