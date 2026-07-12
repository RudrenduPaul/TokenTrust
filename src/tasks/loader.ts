import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, relative, sep } from 'node:path';
import { parse } from 'yaml';
import type { RtkFilter, Task, TaskCorpus, TaskDefinition } from './types.js';

const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const VALID_TYPES = new Set(['bugfix', 'refactor', 'docstring', 'feature-add']);
const VALID_FILTERS = new Set<string>([
  'cargo-test',
  'pytest',
  'go-test',
  'go-build',
  'tsc',
  'vitest',
  'prettier',
  'grep',
  'rg',
  'find',
  'fd',
  'git-log',
  'git-diff',
  'git-status',
  'log',
  'mypy',
  'ruff-check',
  'ruff-format',
]);
const REQUIRED_FIELDS = ['id', 'description', 'fixture_repo', 'prompt', 'difficulty'] as const;

export class TaskSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskSchemaError';
  }
}

/**
 * Loads and validates a tokentrust-tasks.yml file against the schema above.
 * Resolves each task's fixture_repo relative to
 * the corpus file's own directory, and confirms the fixture repo exists.
 */
export function loadTaskCorpus(corpusPath: string): Task[] {
  const absoluteCorpusPath = resolve(corpusPath);
  let raw: string;
  try {
    raw = readFileSync(absoluteCorpusPath, 'utf8');
  } catch (err) {
    throw new TaskSchemaError(
      `Could not read task corpus file at "${absoluteCorpusPath}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new TaskSchemaError(
      `Task corpus file "${absoluteCorpusPath}" is not valid YAML: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const corpus = validateCorpusShape(parsed, absoluteCorpusPath);
  const corpusDir = dirname(absoluteCorpusPath);
  const seenIds = new Set<string>();

  return corpus.tasks.map((task) => {
    validateTask(task, absoluteCorpusPath);
    if (seenIds.has(task.id)) {
      throw new TaskSchemaError(
        `Duplicate task id "${task.id}" in "${absoluteCorpusPath}" -- every task id must be unique.`,
      );
    }
    seenIds.add(task.id);

    if (isAbsolute(task.fixture_repo)) {
      throw new TaskSchemaError(
        `Task "${task.id}" in "${absoluteCorpusPath}" has an absolute fixture_repo path ` +
          `("${task.fixture_repo}") -- fixture_repo must be relative to the corpus file's own ` +
          `directory. A task corpus can read arbitrary local files this way (e.g. ~/.ssh), which ` +
          `is unsafe for a tasks.yml downloaded from an untrusted source.`,
      );
    }

    const fixtureRepoAbsolutePath = resolve(corpusDir, task.fixture_repo);
    const relativeFromCorpusDir = relative(corpusDir, fixtureRepoAbsolutePath);

    if (relativeFromCorpusDir === '..' || relativeFromCorpusDir.startsWith(`..${sep}`) || isAbsolute(relativeFromCorpusDir)) {
      throw new TaskSchemaError(
        `Task "${task.id}" in "${absoluteCorpusPath}" has a fixture_repo path ` +
          `("${task.fixture_repo}") that escapes the corpus file's own directory ` +
          `("${corpusDir}") -- fixture_repo must stay within the directory the tasks.yml file lives in.`,
      );
    }

    if (!pathExists(fixtureRepoAbsolutePath)) {
      throw new TaskSchemaError(
        `Task "${task.id}" in "${absoluteCorpusPath}" points at fixture_repo ` +
          `"${task.fixture_repo}", which does not exist (resolved to "${fixtureRepoAbsolutePath}").`,
      );
    }

    return { ...task, fixtureRepoAbsolutePath };
  });
}

function validateCorpusShape(parsed: unknown, sourcePath: string): TaskCorpus {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new TaskSchemaError(`Task corpus "${sourcePath}" must be a YAML mapping at the top level.`);
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.version !== 'number') {
    throw new TaskSchemaError(`Task corpus "${sourcePath}" is missing a numeric "version" field.`);
  }
  if (!Array.isArray(obj.tasks)) {
    throw new TaskSchemaError(`Task corpus "${sourcePath}" is missing a "tasks" array.`);
  }
  if (obj.tasks.length === 0) {
    throw new TaskSchemaError(`Task corpus "${sourcePath}" has an empty "tasks" list.`);
  }
  return { version: obj.version, tasks: obj.tasks as TaskDefinition[] };
}

function validateTask(task: unknown, sourcePath: string): asserts task is TaskDefinition {
  if (typeof task !== 'object' || task === null) {
    throw new TaskSchemaError(`Task corpus "${sourcePath}" contains a task entry that is not a mapping.`);
  }
  const obj = task as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (typeof obj[field] !== 'string' || obj[field] === '') {
      throw new TaskSchemaError(
        `Task corpus "${sourcePath}" has a task missing required string field "${field}".`,
      );
    }
  }
  if (!VALID_DIFFICULTIES.has(obj.difficulty as string)) {
    throw new TaskSchemaError(
      `Task "${obj.id as string}" in "${sourcePath}" has invalid difficulty "${
        obj.difficulty as string
      }" -- must be one of: easy, medium, hard.`,
    );
  }
  if (obj.type !== undefined && !VALID_TYPES.has(obj.type as string)) {
    throw new TaskSchemaError(
      `Task "${obj.id as string}" in "${sourcePath}" has invalid type "${
        obj.type as string
      }" -- must be one of: bugfix, refactor, docstring, feature-add.`,
    );
  }
  if (obj.quality_markers !== undefined) {
    if (
      !Array.isArray(obj.quality_markers) ||
      obj.quality_markers.some((m) => typeof m !== 'string')
    ) {
      throw new TaskSchemaError(
        `Task "${obj.id as string}" in "${sourcePath}" has a "quality_markers" field that is not a list of strings.`,
      );
    }
  }
  if (obj.filter !== undefined && !VALID_FILTERS.has(obj.filter as RtkFilter)) {
    throw new TaskSchemaError(
      `Task "${obj.id as string}" in "${sourcePath}" has invalid filter "${
        obj.filter as RtkFilter
      }" -- must be one of: ${[...VALID_FILTERS].join(', ')}.`,
    );
  }
}

function pathExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.tokentrust']);

/**
 * Builds the raw context blob a coding agent (or, for filter tasks, a
 * real `<tool> | rtk pipe --filter X` invocation) would see for this
 * task.
 *
 * Filter tasks (task.filter set): returns the fixture repo's captured
 * content completely raw and unmodified -- no `--- path ---` header, no
 * `--- PROMPT ---` suffix -- because that is the literal shape a real
 * piped-stdin invocation receives, and both the baseline token count and
 * the compressed-input token count must measure that identical real
 * shape for the reduction% to mean anything.
 *
 * Non-filter tasks (unchanged behavior): every file in the fixture repo
 * concatenated with a path header, followed by the task prompt.
 */
export function loadFixtureContext(task: Task): string {
  if (task.filter) {
    const files = listFilesRecursive(task.fixtureRepoAbsolutePath);
    return files.map((filePath) => readFileSync(filePath, 'utf8')).join('');
  }
  const files = listFilesRecursive(task.fixtureRepoAbsolutePath);
  const sections = files.map((filePath) => {
    const relPath = relative(task.fixtureRepoAbsolutePath, filePath);
    const content = readFileSync(filePath, 'utf8');
    return `--- ${relPath} ---\n${content}`;
  });
  sections.push(`--- PROMPT ---\n${task.prompt}`);
  return sections.join('\n\n');
}

export function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files.sort();
}
