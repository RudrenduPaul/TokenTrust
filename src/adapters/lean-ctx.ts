import { BaseAdapter } from './base.js';
import type { ProxyName } from './types.js';

/**
 * lean-ctx is a Rust local binary (github.com/yvgude/lean-ctx) -- invoked as
 * an external process, same pattern as rtk.
 */
export class LeanCtxAdapter extends BaseAdapter {
  readonly name: ProxyName = 'lean-ctx';
  readonly binaryName = 'lean-ctx';
  readonly installCommand =
    'curl -fsSL https://raw.githubusercontent.com/yvgude/lean-ctx/main/install.sh | sh  (or: cargo install lean-ctx)';
  protected readonly versionArgs = ['--version'];
  protected readonly compressArgs = ['compress', '--stdin'];
}
