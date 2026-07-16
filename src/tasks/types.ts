export type Difficulty = 'easy' | 'medium' | 'hard';

export type TaskType = 'bugfix' | 'refactor' | 'docstring' | 'feature-add';

/**
 * rtk's real `rtk pipe --filter <name>` filter surface (confirmed against
 * the installed rtk 0.43.0 binary: `rtk pipe --filter <bogus>` lists these
 * as the exact accepted values). Locked to that list -- adding a filter
 * name here that rtk itself doesn't support would make a "filter" task
 * fail every real verification run.
 */
export type RtkFilter =
  | 'cargo-test'
  | 'pytest'
  | 'go-test'
  | 'go-build'
  | 'tsc'
  | 'vitest'
  | 'prettier'
  | 'grep'
  | 'rg'
  | 'find'
  | 'fd'
  | 'git-log'
  | 'git-diff'
  | 'git-status'
  | 'log'
  | 'mypy'
  | 'ruff-check'
  | 'ruff-format';

/**
 * The tokentrust-tasks.yml schema: version / id / description /
 * fixture_repo / prompt / difficulty are the required fields. `type` and
 * `quality_markers` are additive, optional fields -- corpora written before
 * they existed remain valid. `type` fills the "vary task type" requirement
 * from the fixture-corpus guidance; `quality_markers` is the additive TT03
 * extension documented in CONTRIBUTING.md ("How to add a fixture task").
 *
 * `filter` is a second additive optional field (product-scoping fix,
 * rtk decision): when set, this task measures rtk's real
 * `rtk pipe --filter <filter>` stdin-based invocation instead of the
 * default file-based `rtk read -l aggressive <files>` path -- see
 * src/tasks/loader.ts's loadFixtureContext() and src/adapters/rtk.ts's
 * buildCompressInvocation(). Omitting it is always valid; every task
 * written before this field existed keeps working exactly as before.
 */
export interface TaskDefinition {
  id: string;
  description: string;
  fixture_repo: string;
  prompt: string;
  difficulty: Difficulty;
  type?: TaskType;
  quality_markers?: string[];
  filter?: RtkFilter;
}

export interface TaskCorpus {
  version: number;
  tasks: TaskDefinition[];
}

/** A task definition resolved against the corpus file's own directory. */
export interface Task extends TaskDefinition {
  /** Absolute path to the fixture repo directory. */
  fixtureRepoAbsolutePath: string;
}
