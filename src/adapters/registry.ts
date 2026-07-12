import { HeadroomAdapter } from './headroom.js';
import { LeanCtxAdapter } from './lean-ctx.js';
import { RtkAdapter } from './rtk.js';
import type { ProxyAdapter, ProxyName } from './types.js';

/**
 * Small named registry mapping the three known, locked v0.1 proxies to an
 * adapter instance -- NOT a generic plugin-loader. Eng-review is explicit
 * that a config-driven/dynamic-loading N-proxy plugin system would be
 * premature abstraction at this scope (3 known targets, not 30). Adding a
 * 4th proxy means adding one file and one line here, per CONTRIBUTING.md.
 *
 * `getAdapter('headroom')` below still constructs a real HeadroomAdapter if
 * called directly, but `runVerify()`'s v0.1 dispatch loop never actually
 * calls it -- see src/verify.ts / src/adapters/headroom.ts.
 */
const FACTORIES: Record<ProxyName, () => ProxyAdapter> = {
  rtk: () => new RtkAdapter(),
  headroom: () => new HeadroomAdapter(),
  'lean-ctx': () => new LeanCtxAdapter(),
};

export const SUPPORTED_PROXIES: ProxyName[] = ['rtk', 'headroom', 'lean-ctx'];

export function isSupportedProxy(name: string): name is ProxyName {
  return (SUPPORTED_PROXIES as string[]).includes(name);
}

export function getAdapter(name: ProxyName): ProxyAdapter {
  const factory = FACTORIES[name];
  if (!factory) {
    throw new Error(
      `Unknown proxy "${name}". Supported proxies: ${SUPPORTED_PROXIES.join(', ')}.`,
    );
  }
  return factory();
}
