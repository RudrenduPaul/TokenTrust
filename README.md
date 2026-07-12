# TokenTrust

Vendor-neutral CLI that independently verifies the actual token and cost savings
delivered by AI-coding-agent context-reduction proxies, against a real, labeled
task corpus and a local tokenizer. It runs the proxy for real, measures what
actually happened, and puts the claimed number next to the measured one.

```
$ npx tokentrust verify --proxy rtk

TokenTrust v0.1 -- Token/Context-Reduction Claims Verification
Proxy: rtk 0.43.0 | Task corpus: 15 labeled tasks

[MEASURED] TT01 Compression Ratio
  Claimed (rtk README): up to 70% context reduction
  Measured (this corpus): 76.2% average reduction across 15 tasks
  Range: 3.8% ("verify-git-diff-filter") to 94.7% ("docstring-add-jsdoc-class")

[MEASURED] TT02 Cost-Savings Delta
  Actual savings: 68.1% -- vs. claimed 70% ceiling

[FAIL]  TT03 Never-Worse Output Guard
  2/15 tasks regressed in task-completion diff vs. uncompressed baseline

[PASS]  TT05 Version-Drift Regression Check
  No regression vs. last-verified rtk 0.43.0 baseline
```

That's a real run against the bundled fixture corpus, not a hand-typed example.
Run it yourself and it reproduces.

## Why this exists

Context-reduction proxies (`rtk`, `headroom`, and others) publish compression and
cost-savings numbers in their own READMEs. Those numbers come from the maintainer's
own benchmark, on the maintainer's own workload, with no outside check. That's not
an accusation. It's just how every proxy in this space currently reports its own
numbers, and a maintainer benchmarking their own tool isn't running an adversarial
test.

The gap is visible in the proxies' own issue trackers:

- [`rtk#839`](https://github.com/rtk-ai/rtk/issues/839): an open thread where users
  ran their own benchmarks and got materially different numbers than the README claims.
- [`rtk#1935`](https://github.com/rtk-ai/rtk/issues/1935): "rtk gain hallucinates
  savings numbers" (filed 2026-05-18, open).
- [`rtk#582`](https://github.com/rtk-ai/rtk/issues/582): a cost-savings number that
  regressed silently across a version bump, with no test catching it. TT05 exists
  specifically to catch this class of regression before a user does.

TokenTrust doesn't compete with these proxies. It verifies them. It has no stake in
whether a proxy's claimed number is accurate, and every category run prints the
claimed number next to the measured one, so the comparison is never hidden or
averaged away.

## How it compares

| | What it does | Ongoing / self-serve | Installable | Independently verifies claims |
|---|---|---|---|---|
| **TokenTrust** | Runs a proxy against a labeled task corpus, measures real compression/cost/quality, prints claimed vs. measured | Yes, runs in your own CI, on your own repo, every time | Yes (`npx tokentrust`) | Yes, is the whole point |
| [tokbench](https://github.com/Entelligentsia/tokbench) | Independent benchmark of `rtk`/`headroom`/`lean-ctx` on one real agentic SDLC workload, with raw transcripts and a pre-registered protocol | No, a one-time report, last updated 2026-06-15 | No, a static report, not a tool you run | Yes, and rigorously: credit where it's due |
| Langfuse / Vantage / Finout / Amnic / Revenium | LLM cost observability, tracks your actual API spend across models and providers | Yes, hosted/ongoing | Yes | No, these track spend; they don't check whether a specific proxy's specific savings claim holds up |

[tokbench](https://github.com/Entelligentsia/tokbench) is the closest prior art and
deserves real credit: it's a rigorous, disclosed, reproducible one-time comparison of
the same three proxies TokenTrust targets, with raw transcripts and a pre-registered
protocol. Its own results (rtk: 2.28M tokens on a real workload vs. headroom: 3.24M,
+43%) are worth reading directly. TokenTrust's difference is running the same kind of
check continuously, in your own repo and your own CI, instead of as a single published
snapshot.

## Proxy support (v0.1)

| Proxy | Status |
|---|---|
| `rtk` | Fully supported: real subprocess-based verification (`rtk pipe --filter <name>` for stdin-shaped tasks, `rtk read -l aggressive <files>` for file-based tasks). |
| `headroom` | Recognized (`--proxy headroom` is a valid flag value), not yet supported: headroom is an HTTP proxy server, not a one-shot compression CLI, so v0.1's subprocess-based harness can't drive it. `tokentrust verify --proxy headroom` prints a message and skips it instead of failing silently. Planned for a future version behind a real HTTP-proxy-traffic test harness. |
| `lean-ctx` | Recognized, support paused for v0.1. |

## What it measures

- **TT01: Compression Ratio.** Actual token reduction, measured with a local
  tokenizer, against every task in the corpus.
- **TT02: Cost-Savings Delta.** Dollar-cost savings computed from TT01's measured
  token delta at published model pricing. Optional `--live` mode verifies the
  estimate against a real, provider-billed sample (opt-in, your own API key, gated
  behind `--confirm-cost`, capped at 5 tasks by default).
- **TT03: Never-Worse Output Guard.** Checks whether a proxy's compressed output
  dropped content a task marks as required to survive compression.
- **TT04: Cross-Tool Comparative Benchmark.** Runs the identical task corpus through
  every supported proxy side by side.
- **TT05: Version-Drift Regression Detection.** Compares a run's measured savings
  against the last-verified baseline for the same proxy/repo pair, so a silent
  regression across a proxy version bump (like `rtk#582`) gets caught automatically.

## Install and run

```
npx tokentrust verify --proxy rtk
```

No config file is required. `--repo` defaults to the current directory and `--tasks`
defaults to the bundled 15-task corpus, so the command above works standalone.

Add it to CI with the bundled GitHub Action (`action/action.yml`) to re-run
verification automatically whenever a proxy's version bumps.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the project layout, how to add a
verification category or fixture task, and the coverage bar every category change
is held to.

## License

Apache-2.0. See [LICENSE](./LICENSE).
