"""
Local tokenizer wrapper -- no network calls after the encoding data is
cached, no per-run inference cost. Never raises: malformed/non-UTF8-looking
input is a named failure path that returns a skipped result rather than
crashing the batch. Callers (category modules) are responsible for emitting
a WARN and continuing the run.

Ported from src/tokenizer/index.ts, which wraps `js-tiktoken`'s cl100k_base
encoding (the encoding used by GPT-4-class and Claude-adjacent tokenizer
approximations). This port uses `tiktoken`, OpenAI's own Python package,
with the same `cl100k_base` encoding -- verified byte-for-byte identical
output against js-tiktoken on real sample text before this port shipped
(see CONTRIBUTING.md's "Tokenizer parity" section). One real behavioral
difference from the npm package: js-tiktoken bundles the cl100k_base rank
data inside the npm package itself, so it works fully offline from the
first run. `tiktoken` downloads and caches the same public rank data from
OpenAI's blob storage on its first use in a given environment (subsequent
calls reuse the local cache, see `TIKTOKEN_CACHE_DIR`) -- see
docs/getting-started.md for the one-time network requirement this implies.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

try:
    import tiktoken
except ImportError as exc:  # pragma: no cover - dependency is declared in pyproject.toml
    raise ImportError(
        "tokentrust-cli requires the 'tiktoken' package. Install with: pip install tokentrust-cli"
    ) from exc

_REPLACEMENT_CHARACTER = "�"


@dataclass(frozen=True)
class CountResult:
    tokens: int
    # True when the input was skipped (empty text counts as 0 tokens, not skipped).
    skipped: bool
    reason: Optional[str] = None


@lru_cache(maxsize=1)
def _encoding() -> "tiktoken.Encoding":
    return tiktoken.get_encoding("cl100k_base")


def count(text: str) -> CountResult:
    """
    Counts tokens in `text` using the local cl100k_base tokenizer. Never
    raises: a malformed-input or tokenizer error is returned as a skipped
    CountResult with a `reason`, matching the TS `count()` contract exactly.
    """
    if len(text) == 0:
        return CountResult(tokens=0, skipped=False)

    if _is_malformed(text):
        return CountResult(tokens=0, skipped=True, reason="malformed or non-UTF8 input")

    try:
        tokens = _encoding().encode(text, disallowed_special=())
        return CountResult(tokens=len(tokens), skipped=False)
    except Exception as err:  # noqa: BLE001 - mirrors the TS catch-all around encoding.encode()
        return CountResult(tokens=0, skipped=True, reason=str(err) or "unknown tokenizer error")


def _is_malformed(text: str) -> bool:
    """
    Detects text that already contains the Unicode replacement character (a
    strong signal the bytes were decoded incorrectly upstream, e.g. a proxy
    emitting raw binary on stdout instead of text).

    The TS version also detects unpaired UTF-16 surrogates directly, since
    JS strings are UTF-16 code units. Python 3 `str` objects are sequences
    of Unicode code points and cannot hold an unpaired surrogate from
    ordinary decoding (`bytes.decode("utf-8")` raises `UnicodeDecodeError`
    on invalid input rather than producing one) -- so that specific check
    has no equivalent failure mode to port here. The replacement-character
    check, which is the practical signal that actually fires on real
    mis-decoded proxy output, is preserved unchanged.
    """
    return _REPLACEMENT_CHARACTER in text
