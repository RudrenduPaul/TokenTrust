import { describe, expect, it } from 'vitest';
import { RtkAdapter } from './rtk.js';
import { HeadroomAdapter } from './headroom.js';
import { LeanCtxAdapter } from './lean-ctx.js';
import { SUPPORTED_PROXIES, getAdapter, isSupportedProxy } from './registry.js';

describe('registry', () => {
  it('lists exactly the 3 locked v0.1 proxies', () => {
    expect(SUPPORTED_PROXIES).toEqual(['rtk', 'headroom', 'lean-ctx']);
  });

  it('isSupportedProxy() accepts the 3 known proxies and rejects anything else', () => {
    expect(isSupportedProxy('rtk')).toBe(true);
    expect(isSupportedProxy('headroom')).toBe(true);
    expect(isSupportedProxy('lean-ctx')).toBe(true);
    expect(isSupportedProxy('context-mode')).toBe(false);
    expect(isSupportedProxy('made-up-proxy')).toBe(false);
  });

  it('getAdapter() returns the right concrete adapter instance per proxy', () => {
    expect(getAdapter('rtk')).toBeInstanceOf(RtkAdapter);
    expect(getAdapter('headroom')).toBeInstanceOf(HeadroomAdapter);
    expect(getAdapter('lean-ctx')).toBeInstanceOf(LeanCtxAdapter);
  });

  it('getAdapter() returns a fresh instance on every call', () => {
    expect(getAdapter('rtk')).not.toBe(getAdapter('rtk'));
  });

  it('getAdapter() throws a clear error for an unknown proxy', () => {
    // @ts-expect-error -- deliberately passing an invalid proxy name to test the runtime guard
    expect(() => getAdapter('not-a-real-proxy')).toThrow(/Unknown proxy/);
  });
});
