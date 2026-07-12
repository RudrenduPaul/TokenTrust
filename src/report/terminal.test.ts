import { describe, expect, it } from 'vitest';
import { printProgress, renderProgress, renderTerminalReport } from './terminal.js';

describe('renderProgress -- locked format (devex-review Post-devex-review update)', () => {
  it('matches "Measuring... (N/total tasks)" verbatim', () => {
    expect(renderProgress(3, 12)).toBe('Measuring... (3/12 tasks)');
    expect(renderProgress(12, 12)).toBe('Measuring... (12/12 tasks)');
  });
});

describe('printProgress', () => {
  it('does not throw when stdout is a non-TTY (CI logs)', () => {
    expect(() => printProgress(1, 12)).not.toThrow();
  });
});

describe('renderTerminalReport', () => {
  it('renders the full TT01-TT05 sections and separates claimed from measured', () => {
    const output = renderTerminalReport({
      proxy: 'rtk',
      proxyVersion: '2.4.1',
      repo: './my-repo',
      taskCorpusSize: 12,
      tt01: {
        claimedLabel: 'up to 70% context reduction (rtk README)',
        measuredSavingsPct: 41.2,
        taskCorpusSize: 12,
        minTask: { id: 'fix-typo-in-docstring', pct: 12.8 },
        maxTask: { id: 'refactor-large-module', pct: 68.4 },
      },
      tt02: {
        baselineUsd: 4.82,
        compressedUsd: 2.91,
        savingsPct: 39.6,
        savingsUsd: 1.91,
        claimedPct: 70,
        taskCorpusSize: 12,
        pricingModel: 'claude-5-sonnet',
      },
      tt03: { pass: true, regressedCount: 0, taskCorpusSize: 12 },
      tt04: {
        results: [
          { proxy: 'rtk', measuredSavingsPct: 39.6 },
          { proxy: 'headroom', measuredSavingsPct: 44.8 },
          { proxy: 'lean-ctx', measuredSavingsPct: 38.1 },
        ],
        taskCorpusSize: 12,
        primaryProxy: 'rtk',
      },
      tt05: { pass: true, message: 'No regression vs. last-verified rtk 2.3.9 baseline (stored 2026-07-04).' },
      reportPath: './tokentrust-report-2026-07-11.json',
    });

    expect(output).toContain('TokenTrust v0.1');
    expect(output).toContain('[MEASURED] TT01 Compression Ratio');
    expect(output).toContain('Claimed (rtk README): up to 70% context reduction (rtk README)');
    expect(output).toContain('Measured (this repo, this corpus): 41.2% average reduction across 12 tasks');
    expect(output).toContain('[MEASURED] TT02 Cost-Savings Delta');
    expect(output).toContain('[PASS]  TT03 Never-Worse Output Guard');
    expect(output).toContain('[FAIL]  TT04 Cross-Tool Comparative Benchmark');
    expect(output).toContain('rtk is not the highest-measured performer');
    expect(output).toContain('[PASS]  TT05 Version-Drift Regression Check');
    expect(output).toContain('Report: ./tokentrust-report-2026-07-11.json');
    // Anti-sycophancy rules baked into every report (CLAUDE.md rules 3 and 6).
    expect(output).toContain('directional measurement');
    expect(output).toContain('not a guarantee across all possible tasks');
  });

  it('renders TT04 as PASS when the primary proxy is the highest-measured performer', () => {
    const output = renderTerminalReport({
      proxy: 'headroom',
      proxyVersion: '1.2.0',
      repo: '.',
      taskCorpusSize: 12,
      tt04: {
        results: [
          { proxy: 'headroom', measuredSavingsPct: 44.8 },
          { proxy: 'rtk', measuredSavingsPct: 39.6 },
        ],
        taskCorpusSize: 12,
        primaryProxy: 'headroom',
      },
      reportPath: 'report.json',
    });
    expect(output).toContain('[PASS]  TT04 Cross-Tool Comparative Benchmark');
    expect(output).toContain('headroom is the highest-measured performer');
  });

  it('renders TT02 with no claimed figure gracefully', () => {
    const output = renderTerminalReport({
      proxy: 'lean-ctx',
      proxyVersion: '0.9.0',
      repo: '.',
      taskCorpusSize: 3,
      tt02: {
        baselineUsd: 1,
        compressedUsd: 0.5,
        savingsPct: 50,
        savingsUsd: 0.5,
        claimedPct: null,
        taskCorpusSize: 3,
        pricingModel: 'claude-5-sonnet',
      },
      reportPath: 'report.json',
    });
    expect(output).toContain('no claimed figure on file');
  });

  it('notes live verification when tt02.liveVerified is true', () => {
    const output = renderTerminalReport({
      proxy: 'rtk',
      proxyVersion: '2.4.1',
      repo: '.',
      taskCorpusSize: 5,
      tt02: {
        baselineUsd: 1,
        compressedUsd: 0.6,
        savingsPct: 40,
        savingsUsd: 0.4,
        claimedPct: 70,
        taskCorpusSize: 5,
        pricingModel: 'claude-5-sonnet',
        liveVerified: true,
      },
      reportPath: 'report.json',
    });
    expect(output).toContain('Verified against real, provider-billed usage (--live).');
  });
});
