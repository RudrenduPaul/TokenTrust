import { BaseAdapter } from './base.js';
import type { ProxyName } from './types.js';

/**
 * headroom is a Python package (PyPI `headroom-ai`) exposing a `headroom`
 * console-script entry point after `pip install headroom-ai` -- invoked as
 * an external process, same as the Rust-based adapters.
 */
export class HeadroomAdapter extends BaseAdapter {
  readonly name: ProxyName = 'headroom';
  readonly binaryName = 'headroom';
  readonly installCommand = 'pip install headroom-ai';
  protected readonly versionArgs = ['--version'];
  protected readonly compressArgs = ['compress', '--stdin'];
}
