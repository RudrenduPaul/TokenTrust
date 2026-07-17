"""Ported from src/tasks/loader.test.ts."""

from __future__ import annotations

import os
import shutil
import tempfile

import pytest

from tokentrust.tasks.loader import TaskSchemaError, load_fixture_context, load_task_corpus
from tokentrust.tasks.types import Task


@pytest.fixture()
def tmp_dir():
    # Resolved so macOS's /tmp -> /private/tmp symlink doesn't cause a
    # false mismatch against the loader's own os.path.realpath-equivalent
    # resolution of the same directory.
    d = os.path.realpath(tempfile.mkdtemp(prefix="tokentrust-loader-"))
    yield d
    shutil.rmtree(d, ignore_errors=True)


def write_corpus(dir_path: str, yaml_text: str) -> str:
    path = os.path.join(dir_path, "tokentrust-tasks.yml")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(yaml_text)
    return path


def test_loads_the_bundled_default_corpus_successfully():
    from tokentrust.verify import resolve_default_tasks_path

    tasks = load_task_corpus(resolve_default_tasks_path())
    assert len(tasks) == 23
    assert all(len(t.fixture_repo_absolute_path) > 0 for t in tasks)


def test_resolves_fixture_repo_relative_to_corpus_dir(tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "repos", "my-task"), exist_ok=True)
    with open(os.path.join(tmp_dir, "repos", "my-task", "file.txt"), "w", encoding="utf-8") as fh:
        fh.write("hello")
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: my-task
    description: "desc"
    fixture_repo: ./repos/my-task
    prompt: "do the thing"
    difficulty: easy
""",
    )
    tasks = load_task_corpus(path)
    assert tasks[0].fixture_repo_absolute_path == os.path.join(tmp_dir, "repos", "my-task")


def test_rejects_corpus_missing_version_field(tmp_dir):
    path = write_corpus(
        tmp_dir,
        """
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
""",
    )
    with pytest.raises(TaskSchemaError):
        load_task_corpus(path)


def test_rejects_corpus_with_empty_tasks_list(tmp_dir):
    path = write_corpus(tmp_dir, "version: 1\ntasks: []\n")
    with pytest.raises(TaskSchemaError):
        load_task_corpus(path)


def test_rejects_task_missing_required_field(tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "repos", "t1"), exist_ok=True)
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
""",
    )
    with pytest.raises(TaskSchemaError, match="description"):
        load_task_corpus(path)


def test_rejects_invalid_difficulty_value(tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "repos", "t1"), exist_ok=True)
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: impossible
""",
    )
    with pytest.raises(TaskSchemaError, match="difficulty"):
        load_task_corpus(path)


def test_rejects_invalid_type_value(tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "repos", "t1"), exist_ok=True)
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
    type: not-a-real-type
""",
    )
    with pytest.raises(TaskSchemaError, match="type"):
        load_task_corpus(path)


def test_accepts_a_valid_filter_value(tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "repos", "t1"), exist_ok=True)
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
    filter: git-log
""",
    )
    tasks = load_task_corpus(path)
    assert tasks[0].filter == "git-log"


def test_rejects_an_invalid_filter_value(tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "repos", "t1"), exist_ok=True)
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
    filter: not-a-real-filter
""",
    )
    with pytest.raises(TaskSchemaError, match="filter"):
        load_task_corpus(path)


def test_rejects_duplicate_task_ids(tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "repos", "t1"), exist_ok=True)
    path = write_corpus(
        tmp_dir,
        """
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
""",
    )
    with pytest.raises(TaskSchemaError, match="Duplicate task id"):
        load_task_corpus(path)


def test_critical_rejects_absolute_fixture_repo_path(tmp_dir):
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    description: "desc"
    fixture_repo: /etc
    prompt: "do the thing"
    difficulty: easy
""",
    )
    with pytest.raises(TaskSchemaError, match="absolute fixture_repo path"):
        load_task_corpus(path)


def test_critical_rejects_path_traversal_outside_corpus_directory(tmp_dir):
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    description: "desc"
    fixture_repo: ../../../../../../etc
    prompt: "do the thing"
    difficulty: easy
""",
    )
    with pytest.raises(TaskSchemaError, match="escapes the corpus file's own directory"):
        load_task_corpus(path)


def test_rejects_task_pointing_at_nonexistent_fixture_repo(tmp_dir):
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./does-not-exist
    prompt: "p"
    difficulty: easy
""",
    )
    with pytest.raises(TaskSchemaError, match="does not exist"):
        load_task_corpus(path)


def test_rejects_invalid_yaml(tmp_dir):
    path = write_corpus(tmp_dir, "version: 1\ntasks: [this is: not: valid")
    with pytest.raises(TaskSchemaError):
        load_task_corpus(path)


def test_rejects_missing_corpus_file(tmp_dir):
    with pytest.raises(TaskSchemaError):
        load_task_corpus(os.path.join(tmp_dir, "nope.yml"))


def test_accepts_optional_quality_markers_list(tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "repos", "t1"), exist_ok=True)
    path = write_corpus(
        tmp_dir,
        """
version: 1
tasks:
  - id: t1
    description: "d"
    fixture_repo: ./repos/t1
    prompt: "p"
    difficulty: easy
    quality_markers:
      - "function foo"
""",
    )
    tasks = load_task_corpus(path)
    assert tasks[0].quality_markers == ["function foo"]


class TestLoadFixtureContext:
    def test_concatenates_fixture_repo_file_contents_with_task_prompt(self, tmp_dir):
        os.makedirs(os.path.join(tmp_dir, "repo"), exist_ok=True)
        with open(os.path.join(tmp_dir, "repo", "a.js"), "w", encoding="utf-8") as fh:
            fh.write("const a = 1;")
        with open(os.path.join(tmp_dir, "repo", "b.js"), "w", encoding="utf-8") as fh:
            fh.write("const b = 2;")

        task = Task(
            id="t1", description="d", fixture_repo="./repo", prompt="Do the thing",
            difficulty="easy", fixture_repo_absolute_path=os.path.join(tmp_dir, "repo"),
        )
        context = load_fixture_context(task)
        assert "const a = 1;" in context
        assert "const b = 2;" in context
        assert "Do the thing" in context
        assert "a.js" in context
        assert "b.js" in context

    def test_skips_hidden_files_and_node_modules_git_dirs(self, tmp_dir):
        os.makedirs(os.path.join(tmp_dir, "repo", "node_modules"), exist_ok=True)
        os.makedirs(os.path.join(tmp_dir, "repo", ".git"), exist_ok=True)
        with open(os.path.join(tmp_dir, "repo", ".hidden"), "w", encoding="utf-8") as fh:
            fh.write("secret")
        with open(os.path.join(tmp_dir, "repo", "node_modules", "dep.js"), "w", encoding="utf-8") as fh:
            fh.write("ignored")
        with open(os.path.join(tmp_dir, "repo", "visible.js"), "w", encoding="utf-8") as fh:
            fh.write("const visible = true;")

        task = Task(
            id="t1", description="d", fixture_repo="./repo", prompt="p",
            difficulty="easy", fixture_repo_absolute_path=os.path.join(tmp_dir, "repo"),
        )
        context = load_fixture_context(task)
        assert "const visible = true;" in context
        assert "ignored" not in context
        assert "secret" not in context

    def test_filter_task_returns_raw_content_no_header_no_prompt_suffix(self, tmp_dir):
        os.makedirs(os.path.join(tmp_dir, "repo"), exist_ok=True)
        with open(os.path.join(tmp_dir, "repo", "captured-output.txt"), "w", encoding="utf-8") as fh:
            fh.write("raw\tcaptured\ncontent\n")

        task = Task(
            id="t1", description="d", fixture_repo="./repo",
            prompt="This prompt text must not appear in the output",
            difficulty="easy", filter="git-log",
            fixture_repo_absolute_path=os.path.join(tmp_dir, "repo"),
        )
        context = load_fixture_context(task)
        assert context == "raw\tcaptured\ncontent\n"
        assert "--- captured-output.txt ---" not in context
        assert "--- PROMPT ---" not in context
        assert "This prompt text must not appear in the output" not in context

    def test_non_filter_task_regression_guard_gets_old_header_prompt_behavior(self, tmp_dir):
        os.makedirs(os.path.join(tmp_dir, "repo"), exist_ok=True)
        with open(os.path.join(tmp_dir, "repo", "a.js"), "w", encoding="utf-8") as fh:
            fh.write("const a = 1;")

        task = Task(
            id="t1", description="d", fixture_repo="./repo", prompt="Do the thing",
            difficulty="easy", fixture_repo_absolute_path=os.path.join(tmp_dir, "repo"),
        )
        context = load_fixture_context(task)
        assert "--- a.js ---" in context
        assert "--- PROMPT ---" in context
        assert "Do the thing" in context
