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
