import type { ProxyName } from '../adapters/types.js';

/**
 * Locked progress-indicator format (devex-review, Post-devex-review update):
 * a silent 30-45s pause during measurement reads as a hang against the
 * champion-tier <2-minute TTHW target, so this must be shown, not optional.
 */
export function renderProgress(done: number, total: number): string {
  return `Measuring... (${done}/${total} tasks)`;
}

export function printProgress(done: number, total: number): void {
  const line = renderProgress(done, total);
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}`);
    if (done === total) process.stdout.write('\n');
  } else {
    // Non-TTY (CI logs, piped output): one line per update, no \r overwrite.
    process.stdout.write(`${line}\n`);
  }
}

export interface Tt01Summary {
  claimedLabel: string;
  measuredSavingsPct: number;
  taskCorpusSize: number;
  minTask: { id: string; pct: number };
  maxTask: { id: string; pct: number };
}

export interface Tt02Summary {
  baselineUsd: number;
  compressedUsd: number;
  savingsPct: number;
  savingsUsd: number;
  claimedPct: number | null;
  taskCorpusSize: number;
  pricingModel: string;
  liveVerified?: boolean;
}

export interface Tt03Summary {
  pass: boolean;
  regressedCount: number;
  taskCorpusSize: number;
}

export interface Tt04Summary {
  results: Array<{ proxy: ProxyName; measuredSavingsPct: number }>;
  taskCorpusSize: number;
  primaryProxy: ProxyName;
}

export interface Tt05Summary {
  pass: boolean;
  message: string;
}

export interface TerminalReportInput {
  proxy: ProxyName;
  proxyVersion: string;
  repo: string;
  taskCorpusSize: number;
  tt01?: Tt01Summary;
  tt02?: Tt02Summary;
  tt03?: Tt03Summary;
  tt04?: Tt04Summary;
  tt05?: Tt05Summary;
  reportPath: string;
}

export function renderTerminalReport(input: TerminalReportInput): string {
  const lines: string[] = [];
  lines.push('TokenTrust v0.1 -- Token/Context-Reduction Claims Verification');
  lines.push(
    `Proxy: ${input.proxy} ${input.proxyVersion} | Repo: ${input.repo} | Task corpus: ${input.taskCorpusSize} labeled tasks`,
  );
  lines.push('');

  if (input.tt01) {
    const t = input.tt01;
    lines.push('[MEASURED] TT01 Compression Ratio');
    lines.push(`  Claimed (${input.proxy} README): ${t.claimedLabel}`);
    lines.push(
      `  Measured (this repo, this corpus): ${t.measuredSavingsPct.toFixed(1)}% average reduction across ${t.taskCorpusSize} tasks`,
    );
    lines.push(
      `  Range: ${t.minTask.pct.toFixed(1)}% (task: "${t.minTask.id}") to ${t.maxTask.pct.toFixed(1)}% (task: "${t.maxTask.id}")`,
    );
    lines.push('');
  }

  if (input.tt02) {
    const t = input.tt02;
    lines.push('[MEASURED] TT02 Cost-Savings Delta');
    lines.push(
      `  Baseline (uncompressed): $${t.baselineUsd.toFixed(2)} across ${t.taskCorpusSize} tasks @ ${t.pricingModel} pricing`,
    );
    lines.push(`  Compressed (${input.proxy}-proxied): $${t.compressedUsd.toFixed(2)} across ${t.taskCorpusSize} tasks`);
    const claimedLabel = t.claimedPct === null ? 'no claimed figure on file' : `claimed ${t.claimedPct}% ceiling`;
    lines.push(`  Actual savings: ${t.savingsPct.toFixed(1)}% ($${t.savingsUsd.toFixed(2)}) -- vs. ${claimedLabel}`);
    if (t.liveVerified) {
      lines.push('  Verified against real, provider-billed usage (--live).');
    }
    lines.push('');
  }

  if (input.tt03) {
    const t = input.tt03;
    const status = t.pass ? 'PASS' : 'FAIL';
    lines.push(`[${status}]  TT03 Never-Worse Output Guard`);
    lines.push(
      `  ${t.regressedCount}/${t.taskCorpusSize} tasks regressed in task-completion diff vs. uncompressed baseline`,
    );
    lines.push('');
  }

  if (input.tt04) {
    const t = input.tt04;
    const sorted = [...t.results].sort((a, b) => b.measuredSavingsPct - a.measuredSavingsPct);
    const best = sorted[0];
    const isPrimaryBest = best?.proxy === t.primaryProxy;
    const status = isPrimaryBest ? 'PASS' : 'FAIL';
    lines.push(`[${status}]  TT04 Cross-Tool Comparative Benchmark`);
    const others = t.results
      .filter((r) => r.proxy !== t.primaryProxy)
      .map((r) => `${r.proxy}: ${r.measuredSavingsPct.toFixed(1)}% measured reduction`)
      .join(', ');
    lines.push(`  Same ${t.taskCorpusSize}-task corpus, ${others}`);
    lines.push(
      isPrimaryBest
        ? `  ${t.primaryProxy} is the highest-measured performer on this specific task corpus`
        : `  ${t.primaryProxy} is not the highest-measured performer on this specific task corpus`,
    );
    lines.push('');
  }

  if (input.tt05) {
    const t = input.tt05;
    const status = t.pass ? 'PASS' : 'FAIL';
    lines.push(`[${status}]  TT05 Version-Drift Regression Check`);
    lines.push(`  ${t.message}`);
    lines.push('');
  }

  if (input.tt02) {
    const claimedLabel = input.tt02.claimedPct === null ? 'no claimed figure on file' : `claimed: up to ${input.tt02.claimedPct}%`;
    lines.push(`Summary: ${input.tt02.savingsPct.toFixed(1)}% measured cost savings (${claimedLabel}) -- see full report`);
  }
  lines.push(`Report: ${input.reportPath}`);
  lines.push('');
  lines.push(
    `Note: this is a directional measurement across a ${input.taskCorpusSize}-task corpus, not a statistically ` +
      'powered claim across all repos and workloads. A TT03 PASS means no regression was detected on this run, ' +
      'not a guarantee across all possible tasks.',
  );

  return lines.join('\n');
}
