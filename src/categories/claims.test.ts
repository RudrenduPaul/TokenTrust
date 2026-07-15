import { describe, expect, it } from 'vitest';
import { getClaimedSavings } from './claims.js';

describe('getClaimedSavings', () => {
  it('returns a sourced figure for rtk (the README-cited claim)', () => {
    const claim = getClaimedSavings('rtk');
    expect(claim.pct).toBe(70);
    expect(claim.label).toContain('rtk README');
  });

  it('returns null with a clear "no claimed figure" label for proxies without a sourced claim yet', () => {
    for (const proxy of ['headroom'] as const) {
      const claim = getClaimedSavings(proxy);
      expect(claim.pct).toBeNull();
      expect(claim.label).toBe('no claimed figure on file');
    }
  });
});
