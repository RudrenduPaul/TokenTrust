import { describe, expect, it } from 'vitest';
import { count } from './index.js';

describe('tokenizer count()', () => {
  it('counts tokens in plain text', () => {
    const result = count('The quick brown fox jumps over the lazy dog.');
    expect(result.skipped).toBe(false);
    expect(result.tokens).toBeGreaterThan(0);
    // Real js-tiktoken cl100k_base count for this sentence is 10 tokens --
    // asserting the exact number keeps this reproducible from a fresh run,
    // not just "greater than zero".
    expect(result.tokens).toBe(10);
  });

  it('returns zero tokens, not skipped, for an empty string', () => {
    const result = count('');
    expect(result).toEqual({ tokens: 0, skipped: false });
  });

  it('counts more tokens for longer, more repetitive text', () => {
    const short = count('hello world');
    const long = count('hello world '.repeat(20));
    expect(long.tokens).toBeGreaterThan(short.tokens);
  });

  describe('malformed/non-UTF8 input (CRITICAL named failure path)', () => {
    it('flags text containing the Unicode replacement character as skipped, never throws', () => {
      const result = count('valid text � more text');
      expect(result.skipped).toBe(true);
      expect(result.reason).toMatch(/malformed|non-UTF8/i);
      expect(result.tokens).toBe(0);
    });

    it('flags an unpaired high surrogate as skipped, never throws', () => {
      const unpairedHighSurrogate = 'before \ud800 after';
      expect(() => count(unpairedHighSurrogate)).not.toThrow();
      const result = count(unpairedHighSurrogate);
      expect(result.skipped).toBe(true);
    });

    it('flags an unpaired low surrogate as skipped, never throws', () => {
      const unpairedLowSurrogate = 'before \udc00 after';
      const result = count(unpairedLowSurrogate);
      expect(result.skipped).toBe(true);
    });

    it('does not flag a valid surrogate pair (real emoji) as malformed', () => {
      const result = count('valid emoji: 😀');
      expect(result.skipped).toBe(false);
      expect(result.tokens).toBeGreaterThan(0);
    });
  });
});
