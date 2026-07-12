#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { isSupportedProxy, SUPPORTED_PROXIES } from './adapters/registry.js';
import type { ProxyName } from './adapters/types.js';
import { DEFAULT_LIVE_MAX_TASKS_OPTION, CliUsageError, resolveDefaultTasksPath, runVerify } from './verify.js';
import type { VerifyOptions } from './verify.js';

/**
 * Recognized before (and alongside) node:util's strict parseArgs() so that
 * `tokentrust --help` / `tokentrust verify --help` print clean usage text
 * and exit 0 -- instead of parseArgs() throwing an unhandled
 * ERR_PARSE_ARGS_UNKNOWN_OPTION stack trace, since neither --help nor -h is
 * declared in the `options` schema passed to parseArgs.
 */
const HELP_FLAGS = new Set(['--help', '-h']);

export function printTopLevelUsage(print: (line: string) => void = (line) => console.log(line)): void {
  print(
    [
      'tokentrust -- vendor-neutral verification for AI-coding-agent context-reduction proxies',
      '',
      'Usage:',
      '  tokentrust verify --proxy <name> [options]',
      '',
      'Commands:',
      '  verify    Measure a proxy\'s actual token/cost savings against a labeled task corpus',
      '            and compare the measurement to the proxy\'s claimed savings.',
      '',
      'Run "tokentrust verify --help" for the full verify flag list.',
      '',
      'Example:',
      '  tokentrust verify --proxy rtk',
    ].join('\n'),
  );
}

export function printVerifyUsage(print: (line: string) => void = (line) => console.log(line)): void {
  print(
    [
      "tokentrust verify -- measure and verify a proxy's claimed token/cost savings",
      '',
      'Usage:',
      '  tokentrust verify --proxy <name> [options]',
      '',
      'Flags:',
      '  --proxy <name>            Proxy to verify (repeatable). Supported: rtk, headroom, lean-ctx. Required.',
      '  --repo <path>             Repo to measure against (default: current directory)',
      '  --tasks <file>            Task corpus YAML file (default: bundled 12-task corpus)',
      '  --live                    Sample real provider-billed tokens for the first proxy (requires --confirm-cost)',
      '  --confirm-cost            Confirm the estimated spend --live prints before any API call is made',
      '  --live-max-tasks <n>      Max tasks sampled in --live mode (default: 5)',
      '  --format <terminal|json>  Report output format (default: terminal)',
      '  -h, --help                Show this help message and exit',
      '',
      'Example:',
      '  tokentrust verify --proxy rtk',
    ].join('\n'),
  );
}

export interface RawCliFlags {
  proxy: string[];
  repo?: string;
  tasks?: string;
  live: boolean;
  confirmCost: boolean;
  liveMaxTasks?: string;
  format: string;
}

export function parseCliFlags(argv: string[]): RawCliFlags {
  const { values } = parseArgs({
    args: argv,
    options: {
      proxy: { type: 'string', multiple: true, default: [] },
      repo: { type: 'string' },
      tasks: { type: 'string' },
      live: { type: 'boolean', default: false },
      'confirm-cost': { type: 'boolean', default: false },
      'live-max-tasks': { type: 'string' },
      format: { type: 'string', default: 'terminal' },
    },
    allowPositionals: true,
  });

  return {
    proxy: values.proxy ?? [],
    repo: values.repo,
    tasks: values.tasks,
    live: values.live ?? false,
    confirmCost: values['confirm-cost'] ?? false,
    liveMaxTasks: values['live-max-tasks'],
    format: values.format ?? 'terminal',
  };
}

/** Resolves raw, validated flags into the typed options runVerify() expects. */
export function resolveVerifyOptions(flags: RawCliFlags, cwd: string): VerifyOptions {
  if (flags.proxy.length === 0) {
    throw new CliUsageError(
      `--proxy is required (repeatable). Supported proxies: ${SUPPORTED_PROXIES.join(', ')}.\n` +
        'Usage: tokentrust verify --proxy <name> [--repo <path>] [--tasks <file>] [--live] [--confirm-cost] [--live-max-tasks N] [--format terminal|json]',
    );
  }

  const proxies: ProxyName[] = [];
  for (const name of flags.proxy) {
    if (!isSupportedProxy(name)) {
      throw new CliUsageError(`Unknown proxy "${name}". Supported proxies: ${SUPPORTED_PROXIES.join(', ')}.`);
    }
    proxies.push(name);
  }

  let liveMaxTasks = DEFAULT_LIVE_MAX_TASKS_OPTION;
  if (flags.liveMaxTasks !== undefined) {
    const parsed = Number.parseInt(flags.liveMaxTasks, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new CliUsageError(`--live-max-tasks must be a positive integer, got "${flags.liveMaxTasks}".`);
    }
    liveMaxTasks = parsed;
  }

  if (flags.format !== 'terminal' && flags.format !== 'json') {
    throw new CliUsageError(`--format must be "terminal" or "json", got "${flags.format}".`);
  }

  return {
    proxies,
    repo: flags.repo ?? cwd,
    tasksPath: flags.tasks ?? resolveDefaultTasksPath(),
    live: flags.live,
    confirmCost: flags.confirmCost,
    liveMaxTasks,
    format: flags.format,
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv.length > 0 && HELP_FLAGS.has(argv[0]!)) {
    printTopLevelUsage();
    return 0;
  }

  const [subcommand, ...rest] = argv;

  if (subcommand !== 'verify') {
    console.error(
      `Unknown command "${subcommand ?? ''}". Usage: tokentrust verify --proxy <name> [options]`,
    );
    return 1;
  }

  if (rest.some((arg) => HELP_FLAGS.has(arg))) {
    printVerifyUsage();
    return 0;
  }

  let options: VerifyOptions;
  try {
    const flags = parseCliFlags(rest);
    options = resolveVerifyOptions(flags, process.cwd());
  } catch (err) {
    if (err instanceof CliUsageError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  const outcome = await runVerify(options);
  return outcome.exitCode;
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
