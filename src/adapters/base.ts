import { loadFixtureContext } from '../tasks/loader.js';
import type { Task } from '../tasks/types.js';
import { isEnoent, spawnCapture } from './spawn-utils.js';
import { MissingBinaryError, ProxyExecutionError } from './types.js';
import type { AdapterResult, ProxyAdapter, ProxyName } from './types.js';

const VERSION_PATTERN = /(\d+\.\d+\.\d+)/;

export interface CompressInvocation {
  args: string[];
  input?: string;
}

/**
 * Shared implementation for the three ProxyAdapter implementations. Each
 * concrete adapter only supplies its binary name, install command, and the
 * CLI args to invoke for --version / compression -- all process-spawning,
 * caching, and error-handling behavior lives here once ([redacted] DRY
 * note: without this, TT01-TT03's token-counting and comparison logic would
 * otherwise get duplicated once per proxy).
 */
export abstract class BaseAdapter implements ProxyAdapter {
  abstract readonly name: ProxyName;
  abstract readonly binaryName: string;
  abstract readonly installCommand: string;
  protected abstract readonly versionArgs: string[];
  protected abstract readonly compressArgs: string[];

  private cachedVersion: string | undefined;

  async isInstalled(): Promise<boolean> {
    try {
      await spawnCapture(this.binaryName, this.versionArgs);
      return true;
    } catch {
      // Any spawn failure (ENOENT or otherwise) means the binary is not
      // usable from this environment.
      return false;
    }
  }

  async getVersion(): Promise<string> {
    if (this.cachedVersion) return this.cachedVersion;
    try {
      const { stdout, stderr } = await spawnCapture(this.binaryName, this.versionArgs);
      const text = (stdout || stderr).trim();
      const match = VERSION_PATTERN.exec(text);
      this.cachedVersion = match?.[1] ?? 'unknown';
    } catch (err) {
      this.cachedVersion = isEnoent(err) ? 'not-installed' : 'unknown';
    }
    return this.cachedVersion;
  }

  /**
   * Builds the actual CLI invocation for the compress step. Defaults to the
   * adapter's fixed compressArgs over stdin (headroom, lean-ctx). rtk
   * overrides this -- its real CLI has no single fixed args array (it's
   * `rtk pipe --filter X` for stdin-based filter tasks, or
   * `rtk read -l aggressive <files>` for file-based tasks).
   */
  protected buildCompressInvocation(task: Task, context: string): CompressInvocation {
    return { args: this.compressArgs, input: context };
  }

  async run(task: Task, mode: 'compressed' | 'baseline'): Promise<AdapterResult> {
    const start = Date.now();
    const context = loadFixtureContext(task);

    if (mode === 'baseline') {
      const proxyVersion = await this.getVersion();
      return { rawOutput: context, proxyVersion, durationMs: Date.now() - start };
    }

    const installed = await this.isInstalled();
    if (!installed) {
      throw new MissingBinaryError(this.name, this.binaryName, this.installCommand);
    }

    const invocation = this.buildCompressInvocation(task, context);
    const { stdout, stderr, code } = await spawnCapture(this.binaryName, invocation.args, invocation.input);
    if (code !== 0) {
      // Do not treat a failed invocation's stdout (empty, partial, or an
      // error message) as valid compressed output -- see ProxyExecutionError.
      throw new ProxyExecutionError(this.name, this.binaryName, invocation.args, code, stderr);
    }
    const proxyVersion = await this.getVersion();
    return { rawOutput: stdout, proxyVersion, durationMs: Date.now() - start };
  }
}
