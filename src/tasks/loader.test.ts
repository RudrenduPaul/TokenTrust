import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskSchemaError, loadFixtureContext, loadTaskCorpus } from './loader.js';

describe('loadTaskCorpus', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tokentrust-loader-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeCorpus(yaml: string): string {
    const path = join(dir, 'tokentrust-tasks.yml');
    writeFileSync(path, yaml, 'utf8');
    return path;
  }

  it('loads the bundled default corpus successfully', () => {
    const bundledPath = join(process.cwd(), 'fixtures', 'tasks.yml');
    const tasks = loadTaskCorpus(bundledPath);
    expect(tasks.length).toBe(15);
    expect(tasks.every((t) => t.fixtureRepoAbsolutePath.length > 0)).toBe(true);
  });

  it('resolves fixture_repo relative to the corpus file directory', () => {
    mkdirSync(join(dir, 'repos', 'my-task'), { recursive: true });
    writeFileSync(join(dir, 'repos', 'my-task', 'file.txt'), 'hello', 'utf8');
    const path = writeCorpus(`
version: 1
tasks:
  - id: my-task
    description: "desc"
    fixture_repo: ./repos/my-task
    prompt: "do the thing"
    difficulty: easy
`);
    const tasks = loadTaskCorpus(path);
    expect(tasks[0]!.fixtureRepoAbsolutePath).toBe(join(dir, 'repos', 'my-task'));
  });

  it('rejects a corpus missing the version field', () => {
    const path = writeCorpus(`
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
`);
    expect(() => loadTaskCorpus(path)).toThrow(TaskSchemaError);
  });

  it('rejects a corpus with an empty tasks list', () => {
    const path = writeCorpus('version: 1\ntasks: []\n');
    expect(() => loadTaskCorpus(path)).toThrow(TaskSchemaError);
  });

  it('rejects a task missing a required field', () => {
    mkdirSync(join(dir, 'repos', 't1'), { recursive: true });
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
`);
    expect(() => loadTaskCorpus(path)).toThrow(/description/);
  });

  it('rejects an invalid difficulty value', () => {
    mkdirSync(join(dir, 'repos', 't1'), { recursive: true });
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: impossible
`);
    expect(() => loadTaskCorpus(path)).toThrow(/difficulty/);
  });

  it('rejects an invalid type value', () => {
    mkdirSync(join(dir, 'repos', 't1'), { recursive: true });
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
    type: not-a-real-type
`);
    expect(() => loadTaskCorpus(path)).toThrow(/type/);
  });

  it('accepts a valid filter value', () => {
    mkdirSync(join(dir, 'repos', 't1'), { recursive: true });
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
    filter: git-log
`);
    const tasks = loadTaskCorpus(path);
    expect(tasks[0]!.filter).toBe('git-log');
  });

  it('rejects an invalid filter value', () => {
    mkdirSync(join(dir, 'repos', 't1'), { recursive: true });
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
    filter: not-a-real-filter
`);
    expect(() => loadTaskCorpus(path)).toThrow(/filter/);
  });

  it('rejects duplicate task ids', () => {
    mkdirSync(join(dir, 'repos', 't1'), { recursive: true });
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
  - id: t1
    description: "d2"
    fixture_repo: ./repos/t1
    prompt: "p2"
    difficulty: hard
`);
    expect(() => loadTaskCorpus(path)).toThrow(/Duplicate task id/);
  });

  it('CRITICAL: rejects an absolute fixture_repo path (arbitrary local file read)', () => {
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "desc"
    fixture_repo: /etc
    prompt: "do the thing"
    difficulty: easy
`);
    expect(() => loadTaskCorpus(path)).toThrow(TaskSchemaError);
    expect(() => loadTaskCorpus(path)).toThrow(/absolute fixture_repo path/);
  });

  it('CRITICAL: rejects a fixture_repo that path-traverses outside the corpus directory', () => {
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "desc"
    fixture_repo: ../../../../../../etc
    prompt: "do the thing"
    difficulty: easy
`);
    expect(() => loadTaskCorpus(path)).toThrow(TaskSchemaError);
    expect(() => loadTaskCorpus(path)).toThrow(/escapes the corpus file's own directory/);
  });

  it('rejects a task pointing at a non-existent fixture_repo', () => {
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./does-not-exist
    prompt: "p"
    difficulty: easy
`);
    expect(() => loadTaskCorpus(path)).toThrow(/does not exist/);
  });

  it('rejects invalid YAML', () => {
    const path = writeCorpus('version: 1\ntasks: [this is: not: valid');
    expect(() => loadTaskCorpus(path)).toThrow(TaskSchemaError);
  });

  it('rejects a missing corpus file', () => {
    expect(() => loadTaskCorpus(join(dir, 'nope.yml'))).toThrow(TaskSchemaError);
  });

  it('accepts an optional quality_markers list', () => {
    mkdirSync(join(dir, 'repos', 't1'), { recursive: true });
    const path = writeCorpus(`
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
    quality_markers:
      - "function foo"
`);
    const tasks = loadTaskCorpus(path);
    expect(tasks[0]!.quality_markers).toEqual(['function foo']);
  });
});

describe('loadFixtureContext', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tokentrust-context-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('concatenates fixture repo file contents with the task prompt', () => {
    mkdirSync(join(dir, 'repo'), { recursive: true });
    writeFileSync(join(dir, 'repo', 'a.js'), 'const a = 1;', 'utf8');
    writeFileSync(join(dir, 'repo', 'b.js'), 'const b = 2;', 'utf8');

    const task = {
      id: 't1',
      description: 'd',
      fixture_repo: './repo',
      prompt: 'Do the thing',
      difficulty: 'easy' as const,
      fixtureRepoAbsolutePath: join(dir, 'repo'),
    };

    const context = loadFixtureContext(task);
    expect(context).toContain('const a = 1;');
    expect(context).toContain('const b = 2;');
    expect(context).toContain('Do the thing');
    expect(context).toContain('a.js');
    expect(context).toContain('b.js');
  });

  it('skips hidden files and node_modules/.git directories', () => {
    mkdirSync(join(dir, 'repo', 'node_modules'), { recursive: true });
    mkdirSync(join(dir, 'repo', '.git'), { recursive: true });
    writeFileSync(join(dir, 'repo', '.hidden'), 'secret', 'utf8');
    writeFileSync(join(dir, 'repo', 'node_modules', 'dep.js'), 'ignored', 'utf8');
    writeFileSync(join(dir, 'repo', 'visible.js'), 'const visible = true;', 'utf8');

    const task = {
      id: 't1',
      description: 'd',
      fixture_repo: './repo',
      prompt: 'p',
      difficulty: 'easy' as const,
      fixtureRepoAbsolutePath: join(dir, 'repo'),
    };

    const context = loadFixtureContext(task);
    expect(context).toContain('const visible = true;');
    expect(context).not.toContain('ignored');
    expect(context).not.toContain('secret');
  });

  it('filter task: returns fixture content completely raw, with no path header and no PROMPT suffix', () => {
    mkdirSync(join(dir, 'repo'), { recursive: true });
    writeFileSync(join(dir, 'repo', 'captured-output.txt'), 'raw\tcaptured\ncontent\n', 'utf8');

    const task = {
      id: 't1',
      description: 'd',
      fixture_repo: './repo',
      prompt: 'This prompt text must not appear in the output',
      difficulty: 'easy' as const,
      filter: 'git-log' as const,
      fixtureRepoAbsolutePath: join(dir, 'repo'),
    };

    const context = loadFixtureContext(task);
    expect(context).toBe('raw\tcaptured\ncontent\n');
    expect(context).not.toContain('--- captured-output.txt ---');
    expect(context).not.toContain('--- PROMPT ---');
    expect(context).not.toContain('This prompt text must not appear in the output');
  });

  it('non-filter task (regression guard): still gets the old concatenated-with-headers-and-prompt behavior', () => {
    mkdirSync(join(dir, 'repo'), { recursive: true });
    writeFileSync(join(dir, 'repo', 'a.js'), 'const a = 1;', 'utf8');

    const task = {
      id: 't1',
      description: 'd',
      fixture_repo: './repo',
      prompt: 'Do the thing',
      difficulty: 'easy' as const,
      fixtureRepoAbsolutePath: join(dir, 'repo'),
    };

    const context = loadFixtureContext(task);
    expect(context).toContain('--- a.js ---');
    expect(context).toContain('--- PROMPT ---');
    expect(context).toContain('Do the thing');
  });
});
