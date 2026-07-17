# CI integration

## npm CLI: bundled GitHub Action

If your CI runner already has Node.js available, use the bundled composite GitHub Action
(`action/action.yml` at the repo root), which wraps `npx tokentrust-cli verify` and exposes a
`fail-on-regression` input that maps a TT05 version-drift regression straight to a failed
workflow step:

```yaml
- uses: RudrenduPaul/TokenTrust-CLI@main
  with:
    proxy: rtk
    fail-on-regression: 'true'
```

## Python CLI: a plain CI step

There is no bundled GitHub Action for the Python package (yet -- see CONTRIBUTING.md if you want
to add one). Wire it into any CI system as a plain step:

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
refusal, a task-schema error, or a `CorpusMismatchError`) and non-zero otherwise -- see
[concepts.md](../concepts.md) for exactly which failures are exit-code-gated. A TT03 or TT05 FAIL
is reported in the JSON output but does not by itself fail the process exit code, so if you want
CI to hard-fail on a version-drift regression specifically, gate on the report's `tt05` entries
the same way the bundled npm GitHub Action does -- see
[examples/02-json-report-ci-gate](../../examples/02-json-report-ci-gate) for a complete, runnable
version of exactly that check written directly against this package's `run_verify()` API.

## Caching the tokenizer download

`tiktoken`'s `cl100k_base` rank data is fetched from OpenAI's servers on first use in a fresh
environment and cached locally after that (see [getting-started.md](../getting-started.md)'s "A
one-time network fetch, then fully offline" section). In an ephemeral CI runner, cache
`~/.cache/tiktoken` (or wherever `TIKTOKEN_CACHE_DIR` points) between runs to avoid that fetch on
every job:

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/tiktoken
    key: tiktoken-cl100k-base
```
