"""
TokenTrust: vendor-neutral CLI that independently verifies the actual
token/cost savings delivered by AI-coding-agent context-reduction proxies
(rtk, headroom) against a real, labeled task corpus and a local tokenizer.

This is the Python port of the npm package `tokentrust-cli`
(https://www.npmjs.com/package/tokentrust-cli). Same CLI surface, same
verification categories (TT01-TT05), same bundled task corpus, same
cl100k_base local tokenizer -- ported from the TypeScript source at
https://github.com/RudrenduPaul/TokenTrust-CLI so teams that already run a
Python toolchain can `pip install tokentrust-cli` instead of pulling in
Node.js.
"""

from __future__ import annotations

__version__ = "0.2.0"

__all__ = ["__version__"]
