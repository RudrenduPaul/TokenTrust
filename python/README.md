# tokentrust-cli (Python)

Vendor-neutral CLI that independently verifies the token and cost savings AI-coding-agent
context-reduction proxies actually deliver, by running the proxy for real against a labeled
task corpus instead of trusting the maintainer's own number.

This is the Python port of the [`tokentrust-cli` npm package](https://www.npmjs.com/package/tokentrust-cli).
Same CLI surface (`tokentrust verify --proxy <name>`), same TT01-TT05 verification categories, same
bundled 23-task corpus, same `cl100k_base` local tokenizer, ported from the TypeScript source at
[RudrenduPaul/TokenTrust-CLI](https://github.com/RudrenduPaul/TokenTrust-CLI) so Python-first
teams can `pip install` instead of pulling in Node.js.

[![PyPI](https://img.shields.io/pypi/v/tokentrust-cli.svg)](https://pypi.org/project/tokentrust-cli/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../LICENSE)

## Why this exists

Context-reduction proxies for AI coding agents (`rtk`, `headroom`, and others) publish their own
compression and cost-savings numbers, measured on the maintainer's own workload, with nobody
outside the project checking the math. That's not an accusation, it's just how every proxy in
this space currently reports its own numbers, and a maintainer benchmarking their own tool isn't
running an adversarial test.

The gap shows up in the proxies' own issue trackers: an open, 5-repo, 2,100-measurement empirical
benchmark thread asking how rtk's actual savings compare to what it claims
([`rtk#839`](https://github.com/rtk-ai/rtk/issues/839)), a report that rtk's own `gain` command
hallucinates token usage and savings ([`rtk#1935`](https://github.com/rtk-ai/rtk/issues/1935)),
and a cost regression a maintainer's own test suite didn't catch on its own
([`rtk#582`](https://github.com/rtk-ai/rtk/issues/582), "RTK Hook Increases Claude Code Costs by
18%"). TT05 exists specifically to catch that last class of regression before a user does.

TokenTrust doesn't compete with these proxies, it verifies them: a real local tokenizer
(`tiktoken`, `cl100k_base`), a real, bundled, labeled 23-task corpus, and a real subprocess
invocation of the proxy binary itself, not a re-run of the vendor's own benchmark script. Every
category run prints the claimed number right next to the measured one, so the comparison is never
hidden or averaged away. This package is the Python port of that same verification logic, for
teams that don't want a Node.js dependency in their pipeline just to run it.

## Install

```sh
pip install tokentrust-cli
```

```sh
tokentrust verify --proxy rtk
```

## npm and pip: complementary, not competing

TokenTrust ships as two first-class distributions of the same tool: `tokentrust-cli` on npm (Node.js)
and `tokentrust-cli` on PyPI (this package). Both install a `tokentrust` command with an identical
CLI surface, the same TT01-TT05 verification categories, and the same bundled task corpus. Pick
whichever matches your existing toolchain:

- Already run Node.js in CI? `npx tokentrust-cli verify --proxy rtk` needs no install step.
- Python-first shop, or want to pin an exact dependency in `requirements.txt` / `pyproject.toml`?
  `pip install tokentrust-cli` gives you the same verification logic without adding a Node.js
  dependency to your pipeline.

Both distributions are maintained from the same verification methodology and read the same
`tokentrust-tasks.yml` corpus schema, so a report produced by one is directly comparable to a
report produced by the other.

## What it measures

- **TT01: Compression Ratio.** Actual token reduction, measured with a local tokenizer
  (`tiktoken`, `cl100k_base`), against every task in the corpus.
- **TT02: Cost-Savings Delta.** Dollar-cost savings computed from TT01's measured token delta at
  published model pricing. Optional `--live` mode verifies the estimate against a real,
  provider-billed sample (opt-in, your own API key, gated behind `--confirm-cost`, capped at 5
  tasks by default).
- **TT03: Never-Worse Output Guard.** Checks whether a proxy's compressed output dropped content
  a task marks as required to survive compression, or expanded instead of compressed.
- **TT04: Cross-Tool Comparative Benchmark.** Pass `--proxy` more than once and TokenTrust runs
  the identical task corpus through every named proxy side by side.
- **TT05: Version-Drift Regression Detection.** Compares a run's measured savings against the
  last-verified baseline for the same proxy/repo pair, so a silent regression across a version
  bump gets caught automatically.

See [docs/concepts.md](./docs/concepts.md) for how each category's methodology works.

## Commands

```
tokentrust verify --proxy <name> [options]
```

| Flag | Description |
|---|---|
| `--proxy <name>` | Proxy to verify. Repeatable, pass it more than once to run TT04's cross-tool comparison. Supported: `rtk`, `headroom`. Required. |
| `--repo <path>` | Repo to measure against. Defaults to the current directory. |
| `--tasks <file>` | Task corpus YAML file. Defaults to the bundled 23-task corpus. |
| `--live` | Sample real, provider-billed tokens for the first proxy instead of estimating from pricing tables. Requires `--confirm-cost`. |
| `--confirm-cost` | Confirms the estimated spend `--live` prints before any real API call is made. |
| `--live-max-tasks <n>` | Max tasks sampled in `--live` mode. Defaults to 5. |
| `--format <terminal\|json>` | Report output format. Defaults to `terminal`. |
| `-h`, `--help` | Show the help message and exit. |

Exit code is `0` when the run completes with no gated failure, non-zero otherwise.

## Proxy support (v0.1)

| Proxy | Status |
|---|---|
| `rtk` | Fully supported: real subprocess-based verification (`rtk pipe --filter <name>` for stdin-shaped tasks, `rtk read -l aggressive <files>` for file-based tasks). |
| `headroom` | Recognized (`--proxy headroom` is a valid flag value), not yet supported. headroom is an HTTP proxy server, not a one-shot compression CLI, so this version's subprocess-based harness can't drive it. `tokentrust verify --proxy headroom` prints a message and skips it instead of failing silently. |

## Tokenizer fidelity

This port uses [`tiktoken`](https://github.com/openai/tiktoken), OpenAI's own Python tokenizer
package, with the `cl100k_base` encoding: the same encoding the npm package's `js-tiktoken`
dependency uses. Token counts were verified identical between the two libraries on real sample
text before this port shipped (see [CONTRIBUTING.md](./CONTRIBUTING.md)).

One real behavioral difference: `js-tiktoken` bundles the `cl100k_base` rank data inside the npm
package, so the Node CLI works fully offline from its very first run. `tiktoken` downloads and
caches that same public rank data from OpenAI's servers on its first use in a given environment
(set `TIKTOKEN_CACHE_DIR` to control where); every run after that first one uses the local cache
and needs no network. See [docs/getting-started.md](./docs/getting-started.md) for details.

## CI integration

There's no bundled GitHub Action for the Python package (the npm package has one, see the
[project README](https://github.com/RudrenduPaul/TokenTrust-CLI#readme)). Wire it into any CI
system as a plain step, and use `--format json` plus the exit code to gate a build:

```yaml
# .github/workflows/tokentrust.yml
name: TokenTrust verify
on: [pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install tokentrust-cli
      - run: curl -fsSL https://rtk-ai.app/install.sh | sh
      - run: tokentrust verify --proxy rtk --format json > tokentrust-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: tokentrust-report
          path: tokentrust-report.json
```

`tokentrust verify` exits `0` on a completed run with no gated failure (a `--live` cost-gate
refusal, a task-schema error, or a corpus mismatch) and non-zero otherwise. A TT03 or TT05 FAIL is
reported in the JSON output but does not by itself fail the process exit code, so to hard-fail CI
on a version-drift regression specifically, gate on the report's `tt05` entries instead, the same
way the npm package's bundled GitHub Action does, see
[examples/02-json-report-ci-gate](./examples/02-json-report-ci-gate) for a complete, runnable
version of exactly that check against this package's `run_verify()` API. Full walkthrough,
including caching the `tiktoken` tokenizer download between CI runs, is in
[docs/integrations/ci.md](./docs/integrations/ci.md).

## Security

TokenTrust shells out to the `rtk` and `headroom` proxy binaries as unprivileged child processes
using Python's `subprocess.run` with an argument list (never `shell=True`), so proxy output and
task/fixture content can't reach a shell. It never sends task content, repo data, or measurement
results anywhere by default, and makes exactly one network call outside of opt-in `--live`
mode: `tiktoken` fetching the public, non-sensitive `cl100k_base` rank data from OpenAI's servers
on first use in a fresh environment (see [docs/getting-started.md](./docs/getting-started.md)),
cached locally after that.

The one credential this package ever handles is your own Anthropic API key for opt-in `--live`
mode, which verifies TT02's cost estimate against a real, provider-billed sample. That key is read
only from the `TOKENTRUST_LIVE_API_KEY` environment variable, never accepted as a CLI flag (so it
never lands in shell history or a process list), and used for nothing but the single billed
request `--live` makes per sampled task, capped at 5 tasks by default and always gated behind an
explicit `--confirm-cost` before any call is made.

Security reports involving credential handling, command injection through task/fixture input, or
JSON report parsing are especially high priority. Vulnerabilities in the third-party proxy
binaries (`rtk`, `headroom`) themselves are out of scope for this repository, report those
directly to the respective project. To report a vulnerability privately, see
[SECURITY.md](../SECURITY.md) for the disclosure process, or use
[GitHub Security Advisories](https://github.com/RudrenduPaul/TokenTrust-CLI/security/advisories/new).
**Honest note**: this project does not currently publish SLSA provenance, Sigstore signatures, or
an SBOM, and has no OpenSSF Scorecard badge set up, for either distribution. CI runs `npm audit
--audit-level=high` on every pull request touching the npm package; there is no equivalent
automated dependency-audit step wired into CI for the Python package yet, its dependencies are
pinned to bounded version ranges (`tiktoken>=0.7,<1`, `PyYAML>=6.0,<7`) in
[pyproject.toml](./pyproject.toml) instead.

## Development

```sh
pip install -e ".[dev]"
pytest
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the project layout, how to add a verification
category or fixture task, and the coverage bar every category change is held to.

## License

Apache-2.0. See [LICENSE](../LICENSE).
