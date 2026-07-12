import type { ProxyName } from '../adapters/types.js';

export type CategoryId = 'TT01' | 'TT02' | 'TT03' | 'TT04' | 'TT05';

/**
 * Structured, versioned measurement record -- the [redacted] from the
 * [redacted] (Section 8). Every benchmark run, even in the free CLI,
 * produces this record so a `prior_run_id` chain can exist from day one.
 */
export interface ReportRecord {
  run_id: string;
  timestamp: string;
  proxy: ProxyName;
  proxy_version: string;
  repo: string;
  category: CategoryId;
  claimed_savings_pct: number | null;
  measured_savings_pct: number;
  task_corpus_size: number;
  prior_run_id: string | null;
}

export interface Tt03ReportEntry {
  pass: boolean;
  regressed_count: number;
  task_corpus_size: number;
}

export interface Tt05ReportEntry {
  pass: boolean;
  message: string;
  prior_run_id: string | null;
  degraded: boolean;
}

export interface FullReport {
  run_id: string;
  timestamp: string;
  repo: string;
  task_corpus_size: number;
  proxies: ProxyName[];
  /** TT01/TT02/TT04 records, matching the [redacted] [redacted] (Section 8). */
  records: ReportRecord[];
  /** TT03 doesn't fit the "measured_savings_pct" record shape -- a guard, not a savings metric. */
  tt03: Partial<Record<ProxyName, Tt03ReportEntry>>;
  tt05: Partial<Record<ProxyName, Tt05ReportEntry>>;
}
