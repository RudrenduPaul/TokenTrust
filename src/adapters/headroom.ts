import { BaseAdapter } from './base.js';
import type { ProxyName } from './types.js';

/**
 * headroom is a Python package (PyPI `headroom-ai`) exposing a `headroom`
 * console-script entry point after `pip install headroom-ai` -- invoked as
 * an external process, same as the Rust-based adapters.
 *
 * NOT INVOKED IN v0.1: headroom's real CLI surface (confirmed against the
 * installed headroom 0.31.0 binary) is `headroom proxy` -- an HTTP proxy
 * server meant to sit in front of a real LLM API (e.g.
 * `ANTHROPIC_BASE_URL=http://localhost:8787 claude`) -- not a one-shot
 * compress command. There is no CLI invocation shape equivalent to rtk's
 * `rtk pipe --filter` / `rtk read`. `runVerify()` (src/verify.ts) intercepts
 * the 'headroom' proxy name in its dispatch loop and prints a documented
 * "not yet supported" message BEFORE this class is ever constructed --
 * `getAdapter('headroom')` is never called in v0.1. This class and its
 * compressArgs are therefore dead code for now, kept only so the
 * ProxyAdapter registry entry still type-checks. Building a real
 * HTTP-proxy-traffic test harness for headroom is a v0.2+ decision (see
 * CONTRIBUTING.md).
 */
export class HeadroomAdapter extends BaseAdapter {
  readonly name: ProxyName = 'headroom';
  readonly binaryName = 'headroom';
  readonly installCommand = 'pip install headroom-ai';
  protected readonly versionArgs = ['--version'];
  // Not a real headroom CLI surface -- unreachable in v0.1 (see class doc
  // comment above). Kept only to satisfy BaseAdapter's abstract member.
  protected readonly compressArgs: string[] = [];
}
