import type { ProxyName } from '../adapters/types.js';

export interface ClaimedSavings {
  /** The percentage figure itself, or null when no sourced figure is on file yet. */
  pct: number | null;
  /** Human-readable label shown in reports -- always states the source, never presented as this tool's own finding. */
  label: string;
}

/**
 * Claimed compression/savings figures, sourced from each proxy's own public
 * README at the time this file was last updated -- never this tool's own
 * finding ([redacted] anti-sycophancy rule 2). `rtk`'s figure is the one
 * cited in the TokenTrust [redacted] Product Definition section
 * ("up to 70% context reduction"). `headroom` has no sourced figure captured
 * yet as of this build pass -- the benchmark + README pipeline step that
 * follows this one is responsible for sourcing and verifying it before
 * publishing any comparison that implies a number for it.
 */
export const CLAIMED_SAVINGS: Record<ProxyName, ClaimedSavings> = {
  rtk: { pct: 70, label: 'up to 70% context reduction (rtk README)' },
  headroom: { pct: null, label: 'no claimed figure on file' },
};

export function getClaimedSavings(proxy: ProxyName): ClaimedSavings {
  return CLAIMED_SAVINGS[proxy];
}
