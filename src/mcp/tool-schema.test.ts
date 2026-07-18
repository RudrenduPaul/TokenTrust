import { describe, expect, it } from 'vitest';
import {
  VERIFY_TOOL_NAME,
  normalizeProxyInput,
  verifyProxySavingsInputSchema,
} from './tool-schema.js';

describe('verifyProxySavingsInputSchema', () => {
  it('accepts a minimal valid input (single proxy name only)', () => {
    const result = verifyProxySavingsInputSchema.safeParse({ proxy: 'rtk' });
    expect(result.success).toBe(true);
  });

  it('accepts an array of proxy names', () => {
    const result = verifyProxySavingsInputSchema.safeParse({ proxy: ['rtk', 'headroom'] });
    expect(result.success).toBe(true);
  });

  it('accepts the full flag set mirroring the CLI verify flags', () => {
    const result = verifyProxySavingsInputSchema.safeParse({
      proxy: 'rtk',
      repo: '/some/repo',
      tasks: './my-tasks.yml',
      live: true,
      confirmCost: true,
      liveMaxTasks: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing proxy field', () => {
    const result = verifyProxySavingsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty proxy array', () => {
    const result = verifyProxySavingsInputSchema.safeParse({ proxy: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an unsupported proxy name', () => {
    const result = verifyProxySavingsInputSchema.safeParse({ proxy: 'context-mode' });
    expect(result.success).toBe(false);
  });

  it('rejects a zero or negative liveMaxTasks', () => {
    expect(verifyProxySavingsInputSchema.safeParse({ proxy: 'rtk', liveMaxTasks: 0 }).success).toBe(false);
    expect(verifyProxySavingsInputSchema.safeParse({ proxy: 'rtk', liveMaxTasks: -1 }).success).toBe(false);
  });

  it('rejects a non-integer liveMaxTasks', () => {
    expect(verifyProxySavingsInputSchema.safeParse({ proxy: 'rtk', liveMaxTasks: 2.5 }).success).toBe(false);
  });

  it('rejects non-boolean live/confirmCost values', () => {
    expect(verifyProxySavingsInputSchema.safeParse({ proxy: 'rtk', live: 'yes' }).success).toBe(false);
    expect(verifyProxySavingsInputSchema.safeParse({ proxy: 'rtk', confirmCost: 'yes' }).success).toBe(false);
  });

  it('does not accept a "format" field -- the MCP surface never exposes it', () => {
    const parsed = verifyProxySavingsInputSchema.parse({ proxy: 'rtk', format: 'terminal' });
    expect(parsed).not.toHaveProperty('format');
  });
});

describe('normalizeProxyInput', () => {
  it('wraps a single proxy name in an array', () => {
    expect(normalizeProxyInput('rtk')).toEqual(['rtk']);
  });

  it('passes an array of proxy names through unchanged', () => {
    expect(normalizeProxyInput(['rtk', 'headroom'])).toEqual(['rtk', 'headroom']);
  });
});

describe('VERIFY_TOOL_NAME', () => {
  it('is a stable, non-empty tool name', () => {
    expect(VERIFY_TOOL_NAME).toBe('verify_proxy_savings');
  });
});
