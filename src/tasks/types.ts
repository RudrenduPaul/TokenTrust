export type Difficulty = 'easy' | 'medium' | 'hard';

export type TaskType = 'bugfix' | 'refactor' | 'docstring' | 'feature-add';

/**
 * The tokentrust-tasks.yml schema: version / id / description /
 * fixture_repo / prompt / difficulty are the required fields. `type` and
 * `quality_markers` are additive, optional fields -- corpora written before
 * they existed remain valid. `type` fills the "vary task type" requirement
 * from the fixture-corpus guidance; `quality_markers` is the additive TT03
 * extension documented in CONTRIBUTING.md ("How to add a fixture task").
 */
export interface TaskDefinition {
  id: string;
  description: string;
  fixture_repo: string;
  prompt: string;
  difficulty: Difficulty;
  type?: TaskType;
  quality_markers?: string[];
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
