#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { isSupportedProxy, SUPPORTED_PROXIES } from './adapters/registry.js';
import type { ProxyName } from './adapters/types.js';
import { DEFAULT_LIVE_MAX_TASKS_OPTION, CliUsageError, resolveDefaultTasksPath, runVerify } from './verify.js';
import type { VerifyOptions } from './verify.js';

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
  const [subcommand, ...rest] = argv;

  if (subcommand !== 'verify') {
    console.error(
      `Unknown command "${subcommand ?? ''}". Usage: tokentrust verify --proxy <name> [options]`,
    );
    return 1;
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
