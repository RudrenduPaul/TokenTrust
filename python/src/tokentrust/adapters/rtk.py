"""Ported from src/adapters/rtk.ts."""

from __future__ import annotations

from ..tasks.loader import list_files_recursive
from ..tasks.types import Task
from .base import BaseAdapter, CompressInvocation
from .types import ProxyName


class RtkAdapter(BaseAdapter):
    """
    rtk is a Rust binary (single static binary, no Node/Python runtime, no
    shared dependencies with TokenTrust itself) -- invoked as an external
    process rather than imported as a library.

    rtk has no generic "compress arbitrary stdin" command. Its real CLI
    surface (confirmed against the installed rtk 0.43.0 binary) is:
      - `rtk pipe --filter <name>`: reads stdin, applies a named filter
        tuned to a specific dev-tool's real output shape. Used for tasks
        with `task.filter` set.
      - `rtk read -l aggressive <files>`: real language-aware file
        compression, given real file paths. Used for the original
        file-based fixture tasks (no `filter` set).
    """

    name: ProxyName = "rtk"
    binary_name = "rtk"
    install_command = "curl -fsSL https://rtk-ai.app/install.sh | sh  (or: cargo install rtk)"
    version_args = ["--version"]
    # Unused -- see _build_compress_invocation() below, which always
    # supplies the real args for whichever of rtk's two real commands
    # applies to the task at hand.
    compress_args: list = []

    def _build_compress_invocation(self, task: Task, context: str) -> CompressInvocation:
        if task.filter:
            return CompressInvocation(args=["pipe", "--filter", task.filter], input=context)
        files = list_files_recursive(task.fixture_repo_absolute_path)
        return CompressInvocation(args=["read", "-l", "aggressive", *files], input=None)
