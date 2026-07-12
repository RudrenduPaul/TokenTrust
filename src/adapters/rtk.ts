import { BaseAdapter } from './base.js';
import type { ProxyName } from './types.js';

/**
 * rtk is a Rust binary (single static binary, no Node runtime, no shared
 * dependencies with TokenTrust itself) -- invoked as an external process.
 * See [redacted] "Language" note: this is why TokenTrust shells out rather
 * than importing rtk as a library.
 */
export class RtkAdapter extends BaseAdapter {
  readonly name: ProxyName = 'rtk';
  readonly binaryName = 'rtk';
  readonly installCommand = 'curl -fsSL https://rtk-ai.app/install.sh | sh  (or: cargo install rtk)';
  protected readonly versionArgs = ['--version'];
  protected readonly compressArgs = ['compress', '--stdin'];
}
