import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdapter as defaultGetAdapter } from './adapters/registry.js';
import { MissingBinaryError, ProxyExecutionError } from './adapters/types.js';
import type { ProxyAdapter, ProxyName } from './adapters/types.js';
import { getClaimedSavings } from './categories/claims.js';
import { anthropicLiveApiClient } from './categories/live-api-client.js';
import { runTt01 } from './categories/tt01_compression_ratio.js';
import type { Tt01Result } from './categories/tt01_compression_ratio.js';
import {
  DEFAULT_LIVE_MAX_TASKS,
  LIVE_API_KEY_ENV_VAR,
  estimateLiveCost,
  evaluateLiveGate,
  resolveLiveApiKey,
  runLiveVerification,
  runTt02Default,
} from './categories/tt02_cost_delta.js';
import type { LiveApiClient } from './categories/tt02_cost_delta.js';
import { runTt03 } from './categories/tt03_never_worse_guard.js';
import { CorpusMismatchError, runTt04 } from './categories/tt04_cross_tool_benchmark.js';
import {
  DEFAULT_STORE_PATH,
  appendRun,
  loadReportStore,
  runTt05,
  writeReportStore,
} from './categories/tt05_version_drift.js';
import type { ReportStoreRun } from './categories/tt05_version_drift.js';
import { buildReportRecord, generateRunId, serializeReport, writeReport } from './report/json.js';
import { printProgress, renderTerminalReport } from './report/terminal.js';
import type { Tt01Summary, Tt02Summary, Tt03Summary, Tt04Summary, Tt05Summary } from './report/terminal.js';
import type { FullReport, ReportRecord } from './report/types.js';
import { TaskSchemaError, loadFixtureContext, loadTaskCorpus } from './tasks/loader.js';

export class CliUsageError extends Error {}

/**
 * headroom's real CLI surface is an HTTP proxy server (`headroom proxy`),
 * not a one-shot compression command -- v0.1's subprocess-based harness
 * (spawn a binary, pipe stdin, read stdout) cannot drive it. This is
 * printed and the proxy is skipped BEFORE a HeadroomAdapter is ever
 * constructed, rather than letting a (nonexistent) compress invocation fail
 * "naturally". `--proxy headroom` remains a recognized flag value
 * (isSupportedProxy('headroom') stays true) -- it just doesn't produce a
 * verification report yet. Support is planned for a future version behind
 * a real HTTP-proxy-traffic test harness -- see CONTRIBUTING.md.
 */
export const HEADROOM_NOT_YET_SUPPORTED_MESSAGE =
  "headroom is recognized but not yet supported for verification in TokenTrust v0.1: headroom's " +
  'real CLI surface is an HTTP proxy server ("headroom proxy"), not a one-shot compression command, ' +
  "so it cannot be driven by this version's subprocess-based harness (spawn a binary, pipe stdin, " +
  'read stdout). Support is planned for a future version behind a real HTTP-proxy-traffic test ' +
  'harness -- see CONTRIBUTING.md.';

export interface VerifyOptions {
  proxies: ProxyName[];
  repo: string;
  tasksPath: string;
  live: boolean;
  confirmCost: boolean;
  liveMaxTasks: number;
  format: 'terminal' | 'json';
}

export interface VerifyDependencies {
  getAdapter?: (name: ProxyName) => ProxyAdapter;
  now?: () => Date;
  liveApiClient?: LiveApiClient;
  storePath?: string;
  print?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  reportOutPath?: string;
  /**
   * Defaults to report/terminal.ts's printProgress(), which writes straight
   * to process.stdout -- correct for the CLI, but wrong for any transport
   * (e.g. the MCP stdio server) where stdout IS a machine-readable
   * protocol stream and a stray progress line would corrupt it. Overriding
   * this is how such a transport keeps that stream clean without
   * reimplementing TT01/TT03's progress callback wiring.
   */
  printProgress?: (done: number, total: number) => void;
}

export interface VerifyOutcome {
  exitCode: number;
  reportPath?: string;
  report?: FullReport;
}

export const DEFAULT_LIVE_MAX_TASKS_OPTION = DEFAULT_LIVE_MAX_TASKS;

/** Resolves the bundled default task corpus shipped inside the npm package. */
export function resolveDefaultTasksPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'fixtures', 'tasks.yml');
}

function computeMinMaxTask(tt01: Tt01Result): { min: { id: string; pct: number }; max: { id: string; pct: number } } {
  const counted = tt01.perTask.filter((t) => !t.skipped);
  if (counted.length === 0) {
    return { min: { id: 'n/a', pct: 0 }, max: { id: 'n/a', pct: 0 } };
  }
  let min = counted[0]!;
  let max = counted[0]!;
  for (const t of counted) {
    if (t.reductionPct < min.reductionPct) min = t;
    if (t.reductionPct > max.reductionPct) max = t;
  }
  return {
    min: { id: min.taskId, pct: min.reductionPct },
    max: { id: max.taskId, pct: max.reductionPct },
  };
}

/**
 * Core verify pipeline, deliberately separated from argv parsing and
 * process.exit (src/cli.ts) so it can be exercised directly in tests with
 * injected dependencies (fake adapters, fake clock, fake live API client)
 * without spawning a real subprocess.
 */
export async function runVerify(options: VerifyOptions, deps: VerifyDependencies = {}): Promise<VerifyOutcome> {
  const getAdapterFn = deps.getAdapter ?? defaultGetAdapter;
  const now = deps.now ?? (() => new Date());
  const print = deps.print ?? ((line: string) => console.log(line));
  const env = deps.env ?? process.env;
  const liveApiClient = deps.liveApiClient ?? anthropicLiveApiClient;
  const storePath = deps.storePath ?? resolve(options.repo, DEFAULT_STORE_PATH);
  const reportProgress = deps.printProgress ?? printProgress;

  let tasks;
  try {
    tasks = loadTaskCorpus(options.tasksPath);
  } catch (err) {
    if (err instanceof TaskSchemaError) {
      print(`Error: ${err.message}`);
      return { exitCode: 1 };
    }
    throw err;
  }

  const availableAdapters: ProxyAdapter[] = [];
  for (const proxyName of options.proxies) {
    if (proxyName === 'headroom') {
      print(HEADROOM_NOT_YET_SUPPORTED_MESSAGE);
      continue;
    }
    const adapter = getAdapterFn(proxyName);
    const installed = await adapter.isInstalled();
    if (!installed) {
      const err = new MissingBinaryError(adapter.name, adapter.binaryName, adapter.installCommand);
      print(err.message);
    } else {
      availableAdapters.push(adapter);
    }
  }

  if (availableAdapters.length === 0) {
    return { exitCode: 1 };
  }

  if (options.live && availableAdapters.length > 1) {
    print(
      `Note: --live only verifies the first proxy (${availableAdapters[0]!.name}). ` +
        `${availableAdapters
          .slice(1)
          .map((a) => a.name)
          .join(', ')} will use the free local-tokenizer estimate only, not a real API call. ` +
        `Run --proxy ${availableAdapters[1]?.name ?? '<name>'} --live separately to verify another proxy.`,
    );
  }

  const runId = generateRunId(now());
  const timestamp = now().toISOString();

  const records: ReportRecord[] = [];
  const tt03Entries: FullReport['tt03'] = {};
  const tt05Entries: FullReport['tt05'] = {};
  const versionByProxy: Partial<Record<ProxyName, string>> = {};
  const tt01ResultsByProxy: Array<{ proxy: ProxyName; tt01: Tt01Result }> = [];
  const newStoreRuns: ReportStoreRun[] = [];

  let primaryTt01: Tt01Result | undefined;
  let primaryTt02: ReturnType<typeof runTt02Default> | undefined;
  let primaryTt03: Awaited<ReturnType<typeof runTt03>> | undefined;
  let primaryTt05: ReturnType<typeof runTt05> | undefined;
  let liveNote: string | undefined;

  const loadedStore = loadReportStore(storePath);

  for (const [index, adapter] of availableAdapters.entries()) {
    const proxyVersion = await adapter.getVersion();
    versionByProxy[adapter.name] = proxyVersion;
    print(`Measuring... (${adapter.name} ${proxyVersion}, ${tasks.length}-task corpus, ${options.repo})`);

    const claimed = getClaimedSavings(adapter.name);
    let tt01: Tt01Result;
    try {
      tt01 = await runTt01(adapter, tasks, claimed.pct, (done, total) => reportProgress(done, total));
    } catch (err) {
      if (err instanceof ProxyExecutionError) {
        print(`Error: ${err.message}`);
        return { exitCode: 1 };
      }
      throw err;
    }
    tt01ResultsByProxy.push({ proxy: adapter.name, tt01 });

    const tt02 = runTt02Default(tt01.perTask, claimed.pct);

    // --live is scoped to the first available proxy only, to keep real API
    // spend bounded to a single --live-max-tasks sample per invocation even
    // when multiple --proxy flags are passed.
    if (options.live && index === 0) {
      const estimatedCostUsd = estimateLiveCost(tt01.perTask);
      const gate = evaluateLiveGate(
        { live: options.live, confirmCost: options.confirmCost, liveMaxTasks: options.liveMaxTasks },
        tasks.length,
        estimatedCostUsd,
      );
      print(gate.message);
      if (!gate.allowed) {
        return { exitCode: gate.exitCode ?? 1 };
      }

      const apiKey = resolveLiveApiKey(env);
      if (!apiKey) {
        print(`Error: --live requires ${LIVE_API_KEY_ENV_VAR} to be set in the environment. No API call was made.`);
        return { exitCode: 1 };
      }

      const cappedTasks = tasks.slice(0, options.liveMaxTasks);
      const baselineContexts = cappedTasks.map((t) => ({ id: t.id, contextText: loadFixtureContext(t) }));
      const compressedSamples = [];
      for (const t of cappedTasks) {
        const result = await adapter.run(t, 'compressed');
        compressedSamples.push({ id: t.id, contextText: result.rawOutput });
      }

      const baselineLive = await runLiveVerification(baselineContexts, apiKey, options.liveMaxTasks, liveApiClient);
      const compressedLive = await runLiveVerification(compressedSamples, apiKey, options.liveMaxTasks, liveApiClient);
      const liveSavingsPct =
        baselineLive.billedUsd === 0
          ? 0
          : ((baselineLive.billedUsd - compressedLive.billedUsd) / baselineLive.billedUsd) * 100;
      liveNote =
        `Live verification sample (${cappedTasks.length} tasks): provider-billed savings ` +
        `${liveSavingsPct.toFixed(1)}% (baseline $${baselineLive.billedUsd.toFixed(4)}, ` +
        `compressed $${compressedLive.billedUsd.toFixed(4)}) vs. local-tokenizer estimate ${tt02.savingsPct.toFixed(1)}%.`;
    }

    let tt03: Awaited<ReturnType<typeof runTt03>>;
    try {
      tt03 = await runTt03(adapter, tasks, (done, total) => reportProgress(done, total));
    } catch (err) {
      if (err instanceof ProxyExecutionError) {
        print(`Error: ${err.message}`);
        return { exitCode: 1 };
      }
      throw err;
    }
    tt03Entries[adapter.name] = {
      pass: tt03.pass,
      regressed_count: tt03.regressedCount,
      task_corpus_size: tt03.taskCorpusSize,
    };

    const tt05 = runTt05(loadedStore, adapter.name, options.repo, tt02.savingsPct);
    tt05Entries[adapter.name] = {
      pass: tt05.pass,
      message: tt05.message,
      prior_run_id: tt05.priorRunId,
      degraded: tt05.degraded,
    };
    newStoreRuns.push({
      runId,
      timestamp,
      proxy: adapter.name,
      proxyVersion,
      repo: options.repo,
      measuredSavingsPct: tt02.savingsPct,
      priorRunId: tt05.priorRunId,
    });

    records.push(
      buildReportRecord({
        runId,
        timestamp,
        proxy: adapter.name,
        proxyVersion,
        repo: options.repo,
        category: 'TT01',
        claimedSavingsPct: claimed.pct,
        measuredSavingsPct: tt01.measuredSavingsPct,
        taskCorpusSize: tasks.length,
        priorRunId: null,
      }),
    );
    records.push(
      buildReportRecord({
        runId,
        timestamp,
        proxy: adapter.name,
        proxyVersion,
        repo: options.repo,
        category: 'TT02',
        claimedSavingsPct: claimed.pct,
        measuredSavingsPct: tt02.savingsPct,
        taskCorpusSize: tasks.length,
        priorRunId: null,
      }),
    );
    records.push(
      buildReportRecord({
        runId,
        timestamp,
        proxy: adapter.name,
        proxyVersion,
        repo: options.repo,
        category: 'TT05',
        claimedSavingsPct: claimed.pct,
        measuredSavingsPct: tt02.savingsPct,
        taskCorpusSize: tasks.length,
        priorRunId: tt05.priorRunId,
      }),
    );

    if (index === 0) {
      primaryTt01 = tt01;
      primaryTt02 = tt02;
      primaryTt03 = tt03;
      primaryTt05 = tt05;
    }
  }

  let tt04Summary: Tt04Summary | undefined;
  if (availableAdapters.length > 1) {
    try {
      const tt04 = runTt04(tt01ResultsByProxy);
      for (const r of tt04.results) {
        records.push(
          buildReportRecord({
            runId,
            timestamp,
            proxy: r.proxy,
            proxyVersion: versionByProxy[r.proxy] ?? 'unknown',
            repo: options.repo,
            category: 'TT04',
            claimedSavingsPct: getClaimedSavings(r.proxy).pct,
            measuredSavingsPct: r.measuredSavingsPct,
            taskCorpusSize: tt04.taskCorpusSize,
            priorRunId: null,
          }),
        );
      }
      tt04Summary = {
        results: tt04.results.map((r) => ({ proxy: r.proxy, measuredSavingsPct: r.measuredSavingsPct })),
        taskCorpusSize: tt04.taskCorpusSize,
        primaryProxy: availableAdapters[0]!.name,
      };
    } catch (err) {
      if (err instanceof CorpusMismatchError) {
        print(`Error: ${err.message}`);
        return { exitCode: 1 };
      }
      throw err;
    }
  }

  let updatedStore = loadedStore.store;
  for (const run of newStoreRuns) {
    updatedStore = appendRun(updatedStore, run);
  }
  writeReportStore(storePath, updatedStore);

  const fullReport: FullReport = {
    run_id: runId,
    timestamp,
    repo: options.repo,
    task_corpus_size: tasks.length,
    proxies: availableAdapters.map((a) => a.name),
    records,
    tt03: tt03Entries,
    tt05: tt05Entries,
  };

  const reportPath = deps.reportOutPath ?? resolve(options.repo, `tokentrust-report-${timestamp.slice(0, 10)}.json`);
  writeReport(fullReport, reportPath);

  if (options.format === 'json') {
    print(serializeReport(fullReport));
  } else if (primaryTt01 && primaryTt02 && primaryTt03 && primaryTt05) {
    const { min, max } = computeMinMaxTask(primaryTt01);
    const primaryProxy = availableAdapters[0]!;
    const claimed = getClaimedSavings(primaryProxy.name);

    const tt01Summary: Tt01Summary = {
      claimedLabel: claimed.label,
      measuredSavingsPct: primaryTt01.measuredSavingsPct,
      taskCorpusSize: primaryTt01.taskCorpusSize,
      minTask: min,
      maxTask: max,
    };
    const tt02Summary: Tt02Summary = {
      baselineUsd: primaryTt02.baselineUsd,
      compressedUsd: primaryTt02.compressedUsd,
      savingsPct: primaryTt02.savingsPct,
      savingsUsd: primaryTt02.savingsUsd,
      claimedPct: claimed.pct,
      taskCorpusSize: primaryTt02.taskCorpusSize,
      pricingModel: primaryTt02.pricingModel,
      liveVerified: Boolean(liveNote),
    };
    const tt03Summary: Tt03Summary = {
      pass: primaryTt03.pass,
      regressedCount: primaryTt03.regressedCount,
      taskCorpusSize: primaryTt03.taskCorpusSize,
    };
    const tt05Summary: Tt05Summary = { pass: primaryTt05.pass, message: primaryTt05.message };

    print(
      renderTerminalReport({
        proxy: primaryProxy.name,
        proxyVersion: versionByProxy[primaryProxy.name] ?? 'unknown',
        repo: options.repo,
        taskCorpusSize: tasks.length,
        tt01: tt01Summary,
        tt02: tt02Summary,
        tt03: tt03Summary,
        tt04: tt04Summary,
        tt05: tt05Summary,
        reportPath,
      }),
    );
    if (liveNote) print(liveNote);
  }

  return { exitCode: 0, reportPath, report: fullReport };
}
