import { getEncoding } from 'js-tiktoken';

export interface CountResult {
  tokens: number;
  /** True when the input was skipped (empty text counts as 0 tokens, not skipped). */
  skipped: boolean;
  reason?: string;
}

// cl100k_base is the encoding used by GPT-4-class and Claude-adjacent
// tokenizer approximations; js-tiktoken is a pure-JS port with no native
// binary, MIT licensed, actively maintained -- the boring, low-risk choice
// over hand-rolling a BPE tokenizer.
const encoding = getEncoding('cl100k_base');

/**
 * Counts tokens in `text` using a local tokenizer -- no network calls, no
 * per-run inference cost. Never throws: malformed/non-UTF8-looking input is
 * a named failure path that must return
 * a skipped result rather than crash the batch. Callers (category modules)
 * are responsible for emitting a WARN and continuing the run.
 */
export function count(text: string): CountResult {
  if (text.length === 0) {
    return { tokens: 0, skipped: false };
  }

  if (isMalformed(text)) {
    return { tokens: 0, skipped: true, reason: 'malformed or non-UTF8 input' };
  }

  try {
    const tokens = encoding.encode(text);
    return { tokens: tokens.length, skipped: false };
  } catch (err) {
    return {
      tokens: 0,
      skipped: true,
      reason: err instanceof Error ? err.message : 'unknown tokenizer error',
    };
  }
}

/**
 * Detects text that is not well-formed UTF-16 (unpaired surrogates) or that
 * already contains the Unicode replacement character (a strong signal the
 * bytes were decoded incorrectly upstream, e.g. a proxy emitting raw binary
 * on stdout instead of text).
 */
function isMalformed(text: string): boolean {
  if (text.includes('�')) return true;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
        return true; // unpaired high surrogate
      }
      i++; // valid pair, skip the low surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true; // unpaired low surrogate
    }
  }
  return false;
}
