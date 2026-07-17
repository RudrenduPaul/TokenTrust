# Examples

Three runnable examples against the real `tokentrust` library API (not a mock or a stub).
Each one is self-contained; run them from this directory after `pip install tokentrust-cli`
(or `pip install -e ../`. from a source checkout).

| # | Example | What it shows |
|---|---|---|
| [01-basic-verify](./01-basic-verify) | Runs TT01-TT03/TT05 against the bundled task corpus with a fake in-process adapter (no real `rtk` binary required) and prints the terminal report. | The core `run_verify()` pipeline and its dependency-injection points. |
| [02-json-report-ci-gate](./02-json-report-ci-gate) | Runs verification with `format="json"`, then inspects the structured report to gate a CI step on TT05 (version-drift). | Building a CI check on top of the JSON report schema, the same shape `action/action.yml` consumes on the npm side. |
| [03-cross-tool-benchmark](./03-cross-tool-benchmark) | Calls `run_tt04()` directly to compare two proxies' TT01 results side by side. | Using the category modules directly, without going through the CLI. |

Every example uses `tokentrust.verify.VerifyDependencies` to inject a fake adapter instead of
spawning a real `rtk`/`headroom` binary, so they run anywhere Python and this package are
installed -- no proxy binary, no network access, no API key required.
