# Concepts

## What "vendor-neutral verification" means here

Context-reduction proxies (`rtk`, `headroom`, and others) publish their own compression and
cost-savings numbers, measured on their own workload, by their own maintainers. TokenTrust does
not publish a competing number. It runs the proxy for real, as an external subprocess, against a
fixed, labeled task corpus that ships inside this package, measures the actual token delta with
a local tokenizer, and prints that measured number next to the number the proxy's own README
claims. TokenTrust has no stake in whether the claimed number holds up -- it is not a proxy
itself, does not compress anything, and modifies nothing in your repo or the proxy's own
configuration.

"Vendor-neutral" specifically means:

- The claimed figures in `src/tokentrust/categories/claims.py` are sourced from each proxy's own
  public README at the time that file was last updated, never TokenTrust's own finding, and the
  report always states the source next to the number.
- No measurement number is ever computed from a failed proxy invocation. If `rtk` exits non-zero,
  TokenTrust raises `ProxyExecutionError` and reports a failure instead of silently treating
  empty/partial stdout as a real compression result.
- A cross-tool comparison (TT04) only ever runs across an identical task corpus for every proxy
  compared -- `CorpusMismatchError` if that invariant is violated.

## The five verification categories (TT01-TT05)

### TT01: Compression Ratio

Runs each task's fixture content through the proxy twice -- once as an uncompressed baseline,
once through the proxy's real compress invocation -- and counts tokens on both with a local
`cl100k_base` tokenizer (see "Tokenizer methodology" below). The measured average reduction
percentage across the whole corpus is reported next to the proxy's claimed percentage. A task
whose baseline or compressed text is flagged malformed by the tokenizer is skipped with a
warning rather than crashing the batch (`src/tokentrust/tokenizer/__init__.py`'s named failure
path).

### TT02: Cost-Savings Delta

Converts TT01's measured token delta into an actual dollar figure at a fixed, documented pricing
table (`claude-5-sonnet`, $3 per million input tokens as of this package's last update -- see
`src/tokentrust/categories/tt02_cost_delta.py`). This is a directional estimate from local token
counts, not a live billed total.

**Optional `--live` mode** verifies that estimate against a real, provider-billed sample. This is
the one real cost/security boundary in the system, gated behind a locked sequence:

1. `--live` alone refuses, prints the estimated cost, and exits 1 -- no API call is made.
2. `--live --confirm-cost` with a task count over `--live-max-tasks` (default 5) still refuses.
3. Only `--live --confirm-cost` with the task count within the cap proceeds to a real API call,
   using an API key read exclusively from the `TOKENTRUST_LIVE_API_KEY` environment variable --
   never a CLI flag, since flags leak into shell history and CI logs.

### TT03: Never-Worse Output Guard

Checks two independent ways a proxy's "compressed" output can be worse than the raw input it
started from:

1. **Content loss** -- did compression drop any `quality_markers` string a task's fixture marks
   as required to survive.
2. **Token-count expansion** -- does the "compressed" output actually have *more* tokens than the
   raw baseline, a real regression class that content-marker checks alone would miss.

A task is regressed if either check fails. A PASS means the current corpus did not detect a
regression on this run -- it is not a general guarantee, and every report states this limitation.

### TT04: Cross-Tool Comparative Benchmark

Runs the identical task corpus through every proxy named with a repeated `--proxy` flag and
compares TT01's measured reduction side by side. Requires every compared proxy to have run
against exactly the same set of task ids; raises `CorpusMismatchError` otherwise. As of this
package's v0.1, only `rtk` is fully drivable (see the honest caveat below), so this category
only actually produces a comparison once a second proxy becomes fully supported.

### TT05: Version-Drift Regression Detection

Compares this run's measured savings against the last-verified baseline for the same
proxy/repo pair, stored locally in `.tokentrust/report-store.json` and chained by `run_id`. A
drop of more than 5 percentage points versus the prior baseline counts as a regression. This
targets the exact failure pattern of a proxy silently getting worse after a version bump, and
degrades gracefully (passes with a "no comparison available" message, never crashes) if the
local store is missing or corrupted.

## Tokenizer methodology

Both distributions use the `cl100k_base` byte-pair encoding -- the encoding used by GPT-4-class
tokenizer approximations, and a reasonable proxy for token counts across most current LLM
providers even when the target model uses a different exact tokenizer internally. The npm
package uses `js-tiktoken`; this Python package uses `tiktoken`, OpenAI's own reference
implementation. Both consume the same public `cl100k_base` rank data, and produced byte-for-byte
identical token counts on every sample checked before this port shipped -- see
[README.md](../README.md)'s "Tokenizer fidelity" section for the verification method and its one
real caveat (a one-time network fetch to cache the rank data, versus the npm package's fully
offline bundled data).

## Honest limitations

- **headroom is not yet drivable.** headroom's real CLI surface (confirmed against the installed
  `headroom 0.31.0` binary) is `headroom proxy`, an HTTP proxy server meant to sit in front of a
  real LLM API call -- not a one-shot compress command. Neither this package's nor the npm
  package's subprocess-based harness (spawn a binary, pipe stdin, read stdout) can drive that.
  `--proxy headroom` remains a recognized, documented flag value; `run_verify()` intercepts it in
  its dispatch loop and prints `HEADROOM_NOT_YET_SUPPORTED_MESSAGE` before a `HeadroomAdapter` is
  ever constructed, rather than letting a nonexistent invocation fail "naturally."
- **TT04 has no real comparison to run today.** Because headroom is never actually verified in
  v0.1, and only `rtk` is fully supported, a `--proxy rtk --proxy headroom` invocation always
  verifies `rtk` alone -- TT04's cross-tool logic is real, tested, and ready, but the CLI cannot
  exercise it end to end until a second proxy is fully wired up.
- **The bundled corpus is not a statistically powered benchmark.** 23 tasks across four types
  (bugfix, refactor, docstring, feature-add) and three difficulty levels is a directional
  measurement on one specific corpus, not a claim that generalizes to every repo and workload.
  Every terminal and JSON report states this explicitly.
- **A TT05 PASS is relative to your own prior runs on your own machine**, stored in
  `.tokentrust/report-store.json` inside the repo you point `--repo` at. It is not a claim
  compared against any other user's history.
