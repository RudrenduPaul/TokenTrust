import { describe, expect, it } from 'vitest';
import { parseCliFlags, resolveVerifyOptions } from './cli.js';
import { CliUsageError } from './verify.js';

describe('parseCliFlags', () => {
  it('parses a single --proxy flag', () => {
    const flags = parseCliFlags(['--proxy', 'rtk']);
    expect(flags.proxy).toEqual(['rtk']);
    expect(flags.live).toBe(false);
    expect(flags.confirmCost).toBe(false);
    expect(flags.format).toBe('terminal');
  });

  it('parses repeated --proxy flags (cross-tool comparison)', () => {
    const flags = parseCliFlags(['--proxy', 'rtk', '--proxy', 'headroom', '--proxy', 'lean-ctx']);
    expect(flags.proxy).toEqual(['rtk', 'headroom', 'lean-ctx']);
  });

  it('parses --live, --confirm-cost, and --live-max-tasks together', () => {
    const flags = parseCliFlags(['--proxy', 'rtk', '--live', '--confirm-cost', '--live-max-tasks', '3']);
    expect(flags.live).toBe(true);
    expect(flags.confirmCost).toBe(true);
    expect(flags.liveMaxTasks).toBe('3');
  });

  it('defaults --repo and --tasks to undefined when omitted (champion-tier TTHW: no flags required beyond --proxy)', () => {
    const flags = parseCliFlags(['--proxy', 'rtk']);
    expect(flags.repo).toBeUndefined();
    expect(flags.tasks).toBeUndefined();
  });
});

describe('resolveVerifyOptions', () => {
  const cwd = '/home/dev/my-repo';

  it('requires at least one --proxy', () => {
    expect(() => resolveVerifyOptions(parseCliFlags([]), cwd)).toThrow(CliUsageError);
    expect(() => resolveVerifyOptions(parseCliFlags([]), cwd)).toThrow(/--proxy is required/);
  });

  it('rejects an unsupported proxy name', () => {
    expect(() => resolveVerifyOptions(parseCliFlags(['--proxy', 'context-mode']), cwd)).toThrow(
      /Unknown proxy "context-mode"/,
    );
  });

  it('--repo defaults to the given cwd when omitted (locked [redacted] default)', () => {
    const options = resolveVerifyOptions(parseCliFlags(['--proxy', 'rtk']), cwd);
    expect(options.repo).toBe(cwd);
  });

  it('--tasks defaults to the bundled corpus path when omitted (locked [redacted] default)', () => {
    const options = resolveVerifyOptions(parseCliFlags(['--proxy', 'rtk']), cwd);
    expect(options.tasksPath).toMatch(/fixtures[\\/]tasks\.yml$/);
  });

  it('--live-max-tasks defaults to 5', () => {
    const options = resolveVerifyOptions(parseCliFlags(['--proxy', 'rtk']), cwd);
    expect(options.liveMaxTasks).toBe(5);
  });

  it('rejects a non-numeric or non-positive --live-max-tasks', () => {
    expect(() =>
      resolveVerifyOptions(parseCliFlags(['--proxy', 'rtk', '--live-max-tasks', 'nope']), cwd),
    ).toThrow(CliUsageError);
    expect(() =>
      resolveVerifyOptions(parseCliFlags(['--proxy', 'rtk', '--live-max-tasks', '0']), cwd),
    ).toThrow(CliUsageError);
  });

  it('rejects an invalid --format value', () => {
    expect(() => resolveVerifyOptions(parseCliFlags(['--proxy', 'rtk', '--format', 'xml']), cwd)).toThrow(
      CliUsageError,
    );
  });

  it('accepts explicit --repo, --tasks, and --format overrides', () => {
    const options = resolveVerifyOptions(
      parseCliFlags(['--proxy', 'rtk', '--repo', '/other/repo', '--tasks', './my-tasks.yml', '--format', 'json']),
      cwd,
    );
    expect(options.repo).toBe('/other/repo');
    expect(options.tasksPath).toBe('./my-tasks.yml');
    expect(options.format).toBe('json');
  });
});
