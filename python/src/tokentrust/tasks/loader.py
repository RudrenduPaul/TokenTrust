"""Ported from src/tasks/loader.ts."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

import yaml

from .types import DIFFICULTIES, RTK_FILTERS, TASK_TYPES, Task

REQUIRED_FIELDS = ("id", "description", "fixture_repo", "prompt", "difficulty")
_SKIP_DIRS = {".git", "node_modules", ".tokentrust", "__pycache__"}


class TaskSchemaError(Exception):
    pass


def load_task_corpus(corpus_path: str) -> List[Task]:
    """
    Loads and validates a tokentrust-tasks.yml file against the schema.
    Resolves each task's fixture_repo relative to the corpus file's own
    directory, and confirms the fixture repo exists.
    """
    absolute_corpus_path = str(Path(corpus_path).resolve())
    try:
        with open(absolute_corpus_path, "r", encoding="utf-8") as fh:
            raw = fh.read()
    except OSError as err:
        raise TaskSchemaError(
            f'Could not read task corpus file at "{absolute_corpus_path}": {err}'
        ) from err

    try:
        parsed = yaml.safe_load(raw)
    except yaml.YAMLError as err:
        raise TaskSchemaError(
            f'Task corpus file "{absolute_corpus_path}" is not valid YAML: {err}'
        ) from err

    corpus = _validate_corpus_shape(parsed, absolute_corpus_path)
    corpus_dir = os.path.dirname(absolute_corpus_path)
    seen_ids = set()

    tasks: List[Task] = []
    for raw_task in corpus["tasks"]:
        _validate_task(raw_task, absolute_corpus_path)
        task_id = raw_task["id"]
        if task_id in seen_ids:
            raise TaskSchemaError(
                f'Duplicate task id "{task_id}" in "{absolute_corpus_path}" -- '
                "every task id must be unique."
            )
        seen_ids.add(task_id)

        fixture_repo = raw_task["fixture_repo"]
        if os.path.isabs(fixture_repo):
            raise TaskSchemaError(
                f'Task "{task_id}" in "{absolute_corpus_path}" has an absolute fixture_repo path '
                f'("{fixture_repo}") -- fixture_repo must be relative to the corpus file\'s own '
                "directory. A task corpus can read arbitrary local files this way (e.g. ~/.ssh), "
                "which is unsafe for a tasks.yml downloaded from an untrusted source."
            )

        fixture_repo_absolute_path = str(Path(corpus_dir, fixture_repo).resolve())
        relative_from_corpus_dir = os.path.relpath(fixture_repo_absolute_path, corpus_dir)

        if relative_from_corpus_dir == os.pardir or relative_from_corpus_dir.startswith(
            os.pardir + os.sep
        ):
            raise TaskSchemaError(
                f'Task "{task_id}" in "{absolute_corpus_path}" has a fixture_repo path '
                f'("{fixture_repo}") that escapes the corpus file\'s own directory '
                f'("{corpus_dir}") -- fixture_repo must stay within the directory the tasks.yml '
                "file lives in."
            )

        if not os.path.exists(fixture_repo_absolute_path):
            raise TaskSchemaError(
                f'Task "{task_id}" in "{absolute_corpus_path}" points at fixture_repo '
                f'"{fixture_repo}", which does not exist '
                f'(resolved to "{fixture_repo_absolute_path}").'
            )

        tasks.append(
            Task(
                id=task_id,
                description=raw_task["description"],
                fixture_repo=fixture_repo,
                prompt=raw_task["prompt"],
                difficulty=raw_task["difficulty"],
                type=raw_task.get("type"),
                quality_markers=list(raw_task.get("quality_markers") or []),
                filter=raw_task.get("filter"),
                fixture_repo_absolute_path=fixture_repo_absolute_path,
            )
        )

    return tasks


def _validate_corpus_shape(parsed: object, source_path: str) -> dict:
    if not isinstance(parsed, dict):
        raise TaskSchemaError(f'Task corpus "{source_path}" must be a YAML mapping at the top level.')
    if not isinstance(parsed.get("version"), (int, float)) or isinstance(parsed.get("version"), bool):
        raise TaskSchemaError(f'Task corpus "{source_path}" is missing a numeric "version" field.')
    tasks = parsed.get("tasks")
    if not isinstance(tasks, list):
        raise TaskSchemaError(f'Task corpus "{source_path}" is missing a "tasks" array.')
    if len(tasks) == 0:
        raise TaskSchemaError(f'Task corpus "{source_path}" has an empty "tasks" list.')
    return {"version": parsed["version"], "tasks": tasks}


def _validate_task(task: object, source_path: str) -> None:
    if not isinstance(task, dict):
        raise TaskSchemaError(f'Task corpus "{source_path}" contains a task entry that is not a mapping.')

    for field_name in REQUIRED_FIELDS:
        value = task.get(field_name)
        if not isinstance(value, str) or value == "":
            raise TaskSchemaError(
                f'Task corpus "{source_path}" has a task missing required string field "{field_name}".'
            )

    if task["difficulty"] not in DIFFICULTIES:
        raise TaskSchemaError(
            f'Task "{task["id"]}" in "{source_path}" has invalid difficulty "{task["difficulty"]}" -- '
            f"must be one of: {', '.join(DIFFICULTIES)}."
        )

    if task.get("type") is not None and task["type"] not in TASK_TYPES:
        raise TaskSchemaError(
            f'Task "{task["id"]}" in "{source_path}" has invalid type "{task["type"]}" -- '
            f"must be one of: {', '.join(TASK_TYPES)}."
        )

    quality_markers = task.get("quality_markers")
    if quality_markers is not None:
        if not isinstance(quality_markers, list) or any(
            not isinstance(m, str) for m in quality_markers
        ):
            raise TaskSchemaError(
                f'Task "{task["id"]}" in "{source_path}" has a "quality_markers" field '
                "that is not a list of strings."
            )

    task_filter = task.get("filter")
    if task_filter is not None and task_filter not in RTK_FILTERS:
        raise TaskSchemaError(
            f'Task "{task["id"]}" in "{source_path}" has invalid filter "{task_filter}" -- '
            f"must be one of: {', '.join(RTK_FILTERS)}."
        )


def list_files_recursive(directory: str) -> List[str]:
    files: List[str] = []
    with os.scandir(directory) as entries:
        for entry in entries:
            if entry.name.startswith(".") or entry.name in _SKIP_DIRS:
                continue
            if entry.is_dir():
                files.extend(list_files_recursive(entry.path))
            elif entry.is_file():
                files.append(entry.path)
    return sorted(files)


def load_fixture_context(task: Task) -> str:
    """
    Builds the raw context blob a coding agent (or, for filter tasks, a real
    `<tool> | rtk pipe --filter X` invocation) would see for this task.

    Filter tasks (task.filter set): returns the fixture repo's captured
    content completely raw and unmodified. Non-filter tasks: every file in
    the fixture repo concatenated with a path header, followed by the task
    prompt.
    """
    files = list_files_recursive(task.fixture_repo_absolute_path)

    if task.filter:
        parts = []
        for file_path in files:
            with open(file_path, "r", encoding="utf-8") as fh:
                parts.append(fh.read())
        return "".join(parts)

    sections = []
    for file_path in files:
        rel_path = os.path.relpath(file_path, task.fixture_repo_absolute_path)
        with open(file_path, "r", encoding="utf-8") as fh:
            content = fh.read()
        sections.append(f"--- {rel_path} ---\n{content}")
    sections.append(f"--- PROMPT ---\n{task.prompt}")
    return "\n\n".join(sections)
