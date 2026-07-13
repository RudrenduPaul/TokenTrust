<div align="center">

<!-- TODO: record a real terminal demo GIF and drop it here.
     Capture script (run for real, on camera, no fabricated output):
       1. `npx tokentrust-cli verify --proxy rtk` -- let the full 23-task run play out,
          keep the [MEASURED] TT01/TT02 lines and the final summary line on screen.
       2. Target 15-20 seconds, terminal width 100 cols, asciinema or a plain screen
          recording converted to GIF. Save as `docs/demo.gif` and reference it below
          with descriptive alt text once it exists. -->
<!-- <img src="docs/demo.gif" alt="Terminal recording of tokentrust verify --proxy rtk printing claimed vs. measured token and cost savings for rtk 0.43.0 across a 23-task corpus" width="640"> -->

# TokenTrust

Vendor-neutral CLI that independently verifies the token and cost savings AI-coding-agent
context-reduction proxies actually deliver, by running the proxy for real against a labeled
task corpus instead of trusting the maintainer's own number.

[![CI](https://github.com/RudrenduPaul/TokenTrust-CLI/actions/workflows/ci.yml/badge.svg)](https://github.com/RudrenduPaul/TokenTrust-CLI/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/tokentrust-cli.svg)](https://www.npmjs.com/package/tokentrust-cli)

</div>

## Install

```sh
npx tokentrust-cli verify --proxy rtk
```

No clone, no local build. `npx` fetches the published package and runs it directly. To install
it as a dependency instead: `npm install -g tokentrust-cli`.

Real output from that exact command, run against the bundled 23-task corpus:

```
$ npx tokentrust-cli verify --proxy rtk

TokenTrust v0.1 -- Token/Context-Reduction Claims Verification
Proxy: rtk 0.43.0 | Repo: TokenTrust | Task corpus: 23 labeled tasks

[MEASURED] TT01 Compression Ratio
  Claimed (rtk README): up to 70% context reduction
  Measured (this repo, this corpus): 60.7% average reduction across 23 tasks
  Range: 0.0% ("verify-go-build-filter") to 95.4% ("verify-git-log-filter")

[MEASURED] TT02 Cost-Savings Delta
  Baseline (uncompressed): $0.02 across 23 tasks @ claude-5-sonnet pricing
  Compressed (rtk-proxied): $0.00 across 23 tasks
  Actual savings: 77.0% ($0.01) -- vs. claimed 70% ceiling

[FAIL]  TT03 Never-Worse Output Guard
  2/23 tasks regressed in task-completion diff vs. uncompressed baseline

[PASS]  TT05 Version-Drift Regression Check
  No prior verified baseline for rtk on this repo -- this run establishes the first baseline.

Summary: 77.0% measured cost savings (claimed: up to 70%) -- see full report
```

That's a real run's output, not a hand-typed example -- `npx tokentrust-cli` invokes the exact
same `dist/cli.js` entry point (the `tokentrust` command name is unchanged), so it reproduces on
your machine with no clone required.

## Table of contents

- [Why this exists](#why-this-exists)
- [What it measures](#what-it-measures)
- [Commands](#commands)
- [Proxy support](#proxy-support-v01)
- [How it compares](#how-it-compares)
- [What is TokenTrust, and why does it exist](#what-is-tokentrust-and-why-does-it-exist)
- [FAQ](#faq)
- [Real-world validation](#real-world-validation)
- [Contributing](#contributing)
- [License](#license)

## Why this exists

Context-reduction proxies (`rtk`, `headroom`, `lean-ctx`, and others) publish compression and
cost-savings numbers in their own READMEs. Those numbers come from the maintainer's own
benchmark, on the maintainer's own workload, with nobody outside the project checking the math.
That's not an accusation. It's just how every proxy in this space currently reports its own
numbers, and a maintainer benchmarking their own tool isn't running an adversarial test.

The gap shows up in the proxies' own issue trackers:

- [`rtk#839`](https://github.com/rtk-ai/rtk/issues/839), an open, 5-repo, 2,100-measurement
  empirical benchmark thread asking how rtk's actual savings compare to what it claims.
- [`rtk#1935`](https://github.com/rtk-ai/rtk/issues/1935), "rtk gain hallucinates massive
  token usage and savings" (open).
- [`rtk#582`](https://github.com/rtk-ai/rtk/issues/582), "RTK Hook Increases Claude Code Costs
  by 18%," a cost regression a maintainer's own test suite didn't catch on its own. TT05 exists
  specifically to catch this class of regression before a user does.

TokenTrust doesn't compete with these proxies. It verifies them. It has no stake in whether a
proxy's claimed number holds up, and every category run prints the claimed number right next to
the measured one, so the comparison is never hidden or averaged away.

We also found and fixed a bug in our own measurement: one fixture's baseline had accidentally
been captured with `git log --oneline` instead of a true raw `git log`, which understated rtk's
real compression on that task by roughly 42 percentage points. Recapturing it honestly is why
`verify-git-log-filter` now measures 95.4%, the highest reduction in the corpus, and a real one.
[Commit e42246c](https://github.com/RudrenduPaul/TokenTrust-CLI/commit/e42246c) has the fix --
no measurement number ships without a fixture-run behind it.

## What it measures

- **TT01: Compression Ratio.** Actual token reduction, measured with a local tokenizer
  (`js-tiktoken`), against every task in the corpus.
- **TT02: Cost-Savings Delta.** Dollar-cost savings computed from TT01's measured token delta at
  published model pricing. Optional `--live` mode verifies the estimate against a real,
  provider-billed sample (opt-in, your own API key, gated behind `--confirm-cost`, capped at 5
  tasks by default).
- **TT03: Never-Worse Output Guard.** Checks whether a proxy's compressed output dropped content
  a task marks as required to survive compression.
- **TT04: Cross-Tool Comparative Benchmark.** Pass `--proxy` more than once and TokenTrust runs
  the identical task corpus through every named proxy side by side.
- **TT05: Version-Drift Regression Detection.** Compares a run's measured savings against the
  last-verified baseline for the same proxy/repo pair, so a silent regression across a version
  bump (like `rtk#582`) gets caught automatically.

## Commands

```
tokentrust verify --proxy <name> [options]
```

| Flag | Description |
|---|---|
| `--proxy <name>` | Proxy to verify. Repeatable, pass it more than once to run TT04's cross-tool comparison. Supported: `rtk`, `headroom`, `lean-ctx`. Required. |
| `--repo <path>` | Repo to measure against. Defaults to the current directory. |
| `--tasks <file>` | Task corpus YAML file. Defaults to the bundled 23-task corpus. |
| `--live` | Sample real, provider-billed tokens for the first proxy instead of estimating from pricing tables. Requires `--confirm-cost`. |
| `--confirm-cost` | Confirms the estimated spend `--live` prints before any real API call is made. |
| `--live-max-tasks <n>` | Max tasks sampled in `--live` mode. Defaults to 5. |
| `--format <terminal\|json>` | Report output format. Defaults to `terminal`. |
| `-h`, `--help` | Show the help message and exit. |

Exit code is `0` when the run completes with no gated failure, non-zero otherwise. The bundled
GitHub Action's `--fail-on-regression` maps that straight to a failed CI step, so a version-drift
regression breaks the build instead of shipping silently.

Add it to CI with the bundled GitHub Action (`action/action.yml`) so verification reruns
automatically whenever a proxy's version bumps:

```yaml
- uses: RudrenduPaul/TokenTrust-CLI@main
  with:
    proxy: rtk
    fail-on-regression: 'true'
```

## Proxy support (v0.1)

| Proxy | Status |
|---|---|
| `rtk` | Fully supported: real subprocess-based verification (`rtk pipe --filter <name>` for stdin-shaped tasks, `rtk read -l aggressive <files>` for file-based tasks). |
| `headroom` | Recognized (`--proxy headroom` is a valid flag value), not yet supported. headroom is an HTTP proxy server, not a one-shot compression CLI, so v0.1's subprocess-based harness can't drive it. `tokentrust verify --proxy headroom` prints a message and skips it instead of failing silently. |
| `lean-ctx` | Recognized, support paused for v0.1. |

## How it compares

| | What it does | Ongoing / self-serve | Verifies a specific claim |
|---|---|---|---|
| **TokenTrust** | Runs a named proxy against a labeled task corpus, measures real compression, cost, and output-quality regression, prints claimed vs. measured | Yes, runs in your own CI, on your own repo, every time a proxy version bumps | Yes, that's the whole point |
| [tokbench](https://github.com/Entelligentsia/tokbench) | Independent pilot benchmark of rtk, headroom, and lean-ctx on one real agentic SDLC task, with raw transcripts and a pre-registered protocol | No, a single-repo, N=1 pilot report, replication in progress | Yes, and rigorously: credit where it's due |
| [Langfuse](https://github.com/langfuse/langfuse), Vantage, Finout, Amnic, Revenium | LLM/AI cost observability and FinOps. Track your actual API spend across models and providers, allocate it across teams | Yes, hosted or self-hosted, ongoing | No, these track what you spent; they don't check whether a specific proxy's specific savings claim holds up |

[tokbench](https://github.com/Entelligentsia/tokbench) is the closest prior art and deserves real
credit. It's rigorous and disclosed, but its pilot scope is narrower than a first read suggests:
one repository, one task, N=1 per arm, replication runs in progress. Its own numbers on that
pilot are worth reading directly. Provider-billed input tokens against a 2.28M-token native
baseline came in at 2.89M for rtk (+27%) and 3.24M for headroom (+43%, despite headroom
genuinely compressing 342K tokens on the wire), because the agent's turn count grew even as the
per-turn payload shrank. That's a real, independently useful data point, and it's exactly the
kind of gap between "compressed" and "cheaper" TokenTrust exists to keep catching, continuously,
in your own repo rather than a single published pilot.

## What is TokenTrust, and why does it exist

TokenTrust is a command-line tool that measures whether an AI-coding-agent context-reduction
proxy's advertised token and cost savings hold up against a real, labeled task corpus, run with a
local tokenizer instead of a spreadsheet estimate. It exists because compression proxies
currently self-report their own savings numbers, and there is no independent, repeatable,
CI-native way to check one before adopting it. TokenTrust is not a proxy itself and does not
compress anything. It verifies proxies that do.

## FAQ

**How does TokenTrust decide a savings number is trustworthy?**
It doesn't decide trust for you. It runs the proxy against a fixed, labeled task corpus, measures
the real token delta with a local tokenizer, and prints that measured number next to the number
the proxy's own README claims. What you do with the gap is up to you.

**Does TokenTrust modify my code or my proxy's compressed output?**
No. It runs the proxy as a real subprocess against fixture tasks, captures the output, and
measures it. Nothing in your repo or the proxy's configuration is changed.

**What happens if a proxy regresses output quality to hit a bigger compression number?**
That's what TT03 (Never-Worse Output Guard) checks: whether the compressed output dropped
content a task marked as required to survive compression. On the current 23-task corpus, TT03
fails on 2 tasks (`refactor-extract-service`, `add-retry-wrapper-feature`), both pre-existing and
tracked openly rather than hidden from the summary.

**Can TokenTrust verify a proxy's live, provider-billed cost instead of an estimate?**
Yes, with `--live --confirm-cost`, capped at 5 tasks by default via `--live-max-tasks`. It uses
your own API key and never runs a real charge without printing the estimated spend first.

**Does TokenTrust support more than one proxy?**
`rtk` is fully supported today. `headroom` and `lean-ctx` are recognized flag values but not yet
drivable. headroom is an HTTP proxy server rather than a one-shot CLI, and `lean-ctx` support is
paused for v0.1. Passing `--proxy` more than once runs TT04's cross-tool comparison across
whichever proxies are supported.

**Is the 23-task corpus statistically representative of every codebase?**
No, and the CLI says so on every run: it's a directional measurement across a fixed corpus, not a
statistically powered claim across all repos and workloads. A TT05 pass means no regression was
detected on this run, not a guarantee across all possible future tasks.

## Real-world validation

TokenTrust's own validation work has already fed back into a real, independently tracked GitHub
issue: [`rtk-ai/rtk#1313`](https://github.com/rtk-ai/rtk/issues/1313) (filed by @ChrisEdwards,
asking rtk for a lossless-only mode and an honest account of the silent failures truncation
causes in agent contexts) was originally verified as only partially addressed by rtk's existing
mechanism, because TokenTrust's own fixtures didn't yet carry the quality markers needed to prove
it either way. Extending three of TokenTrust's `pipe --filter` fixtures with real, verified
quality markers closed that gap in TokenTrust's own instrumentation, not in rtk, and let the tool
confirm, against the real rtk 0.43.0 binary and not a claim, that rtk's existing never-worse guard
mechanism already does what the issue asked for. The issue's verdict moved from partial to a
genuine, re-verified pass as a direct result. TokenTrust never touched rtk's own repository; it
got sharp enough to prove what was already true there.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the project layout, how to add a verification
category or fixture task, and the coverage bar every category change is held to.

## License

Apache-2.0. See [LICENSE](./LICENSE).
