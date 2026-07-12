import { listFilesRecursive } from '../tasks/loader.js';
import type { Task } from '../tasks/types.js';
import { BaseAdapter } from './base.js';
import type { CompressInvocation } from './base.js';
import type { ProxyName } from './types.js';

/**
 * rtk is a Rust binary (single static binary, no Node runtime, no shared
 * dependencies with TokenTrust itself) -- invoked as an external process.
 * See [redacted] "Language" note: this is why TokenTrust shells out rather
 * than importing rtk as a library.
 *
 * rtk has no generic "compress arbitrary stdin" command. Its real CLI
 * surface (confirmed against the installed rtk 0.43.0 binary) is:
 *   - `rtk pipe --filter <name>`: reads stdin, applies a named filter tuned
 *     to a specific dev-tool's real output shape (git-diff, vitest, etc.),
 *     prints filtered output. Used for tasks with `task.filter` set.
 *   - `rtk read -l aggressive <files>`: real language-aware file
 *     compression, given real file paths. Used for the original file-based
 *     fixture tasks (no `filter` set).
 */
export class RtkAdapter extends BaseAdapter {
  readonly name: ProxyName = 'rtk';
  readonly binaryName = 'rtk';
  readonly installCommand = 'curl -fsSL https://rtk-ai.app/install.sh | sh  (or: cargo install rtk)';
  protected readonly versionArgs = ['--version'];
  // Unused -- see buildCompressInvocation() below, which always supplies
  // the real args for whichever of rtk's two real commands applies to the
  // task at hand. Kept only to satisfy BaseAdapter's abstract member.
  protected readonly compressArgs: string[] = [];

  protected override buildCompressInvocation(task: Task, context: string): CompressInvocation {
    if (task.filter) {
      return { args: ['pipe', '--filter', task.filter], input: context };
    }
    const files = listFilesRecursive(task.fixtureRepoAbsolutePath);
    return { args: ['read', '-l', 'aggressive', ...files] };
  }
}
