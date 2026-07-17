"""Ported from src/tasks/types.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

DIFFICULTIES = ("easy", "medium", "hard")
TASK_TYPES = ("bugfix", "refactor", "docstring", "feature-add")

# rtk's real `rtk pipe --filter <name>` filter surface (confirmed against
# the installed rtk 0.43.0 binary: `rtk pipe --filter <bogus>` lists these
# as the exact accepted values). Locked to that list -- adding a filter
# name here that rtk itself doesn't support would make a "filter" task
# fail every real verification run.
RTK_FILTERS = (
    "cargo-test",
    "pytest",
    "go-test",
    "go-build",
    "tsc",
    "vitest",
    "prettier",
    "grep",
    "rg",
    "find",
    "fd",
    "git-log",
    "git-diff",
    "git-status",
    "log",
    "mypy",
    "ruff-check",
    "ruff-format",
)


@dataclass(frozen=True)
class TaskDefinition:
    """
    The tokentrust-tasks.yml schema: version / id / description /
    fixture_repo / prompt / difficulty are the required fields. `type` and
    `quality_markers` are additive, optional fields -- corpora written
    before they existed remain valid. `filter`, when set, measures rtk's
    real `rtk pipe --filter <filter>` stdin-based invocation instead of the
    default file-based `rtk read -l aggressive <files>` path.
    """

    id: str
    description: str
    fixture_repo: str
    prompt: str
    difficulty: str
    type: Optional[str] = None
    quality_markers: List[str] = field(default_factory=list)
    filter: Optional[str] = None


@dataclass(frozen=True)
class Task(TaskDefinition):
    """A task definition resolved against the corpus file's own directory."""

    fixture_repo_absolute_path: str = ""
