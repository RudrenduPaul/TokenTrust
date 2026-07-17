"""Ported from src/adapters/headroom.ts."""

from __future__ import annotations

from .base import BaseAdapter
from .types import ProxyName


class HeadroomAdapter(BaseAdapter):
    """
    headroom is a Python package (PyPI `headroom-ai`) exposing a `headroom`
    console-script entry point after `pip install headroom-ai` -- invoked
    as an external process, same as rtk.

    NOT INVOKED IN v0.1 of this port either: headroom's real CLI surface
    (confirmed against the installed headroom 0.31.0 binary) is
    `headroom proxy` -- an HTTP proxy server meant to sit in front of a
    real LLM API -- not a one-shot compress command. `run_verify()`
    (tokentrust/verify.py) intercepts the 'headroom' proxy name in its
    dispatch loop and prints a documented "not yet supported" message
    BEFORE this class is ever constructed. This class and its
    compress_args are dead code for now, kept only so the ProxyAdapter
    registry entry stays consistent with the TS source it was ported from.
    """

    name: ProxyName = "headroom"
    binary_name = "headroom"
    install_command = "pip install headroom-ai"
    version_args = ["--version"]
    # Not a real headroom CLI surface -- unreachable in v0.1 (see class docstring).
    compress_args: list = []
