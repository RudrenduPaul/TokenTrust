# Getting started

TokenTrust measures whether an AI-coding-agent context-reduction proxy's advertised token and
cost savings hold up against a real, labeled task corpus, run with a local tokenizer instead of
a spreadsheet estimate. It ships as two independent, equally first-class packages that read the
same task-corpus schema and produce the same report shape: an npm package (`tokentrust-cli`,
TypeScript/Node.js) and a PyPI package (`tokentrust-cli`, Python, this one). Pick whichever fits
your toolchain, or install both.

## Install

**npm (Node.js CLI):**

```bash
npx tokentrust-cli verify --proxy rtk
# or install as a dependency:
npm install -g tokentrust-cli
```

**pip (Python library + CLI):**

```bash
pip install tokentrust-cli
```

The bundled 23-task corpus and its fixture repos ship inside both packages -- `tokentrust verify
--proxy rtk` works immediately after install, with no other flags required, as long as `rtk`
itself is on your `PATH`.

## Your first run

Install `rtk` first (TokenTrust verifies it, it does not bundle it):

```bash
curl -fsSL https://rtk-ai.app/install.sh | sh
```

Then run TokenTrust against the bundled corpus:

```bash
tokentrust verify --proxy rtk
```

Real output looks like this (proxy version, exact percentages, and the specific regressed task
count will vary with your installed `rtk` version and the repo you point `--repo` at):

```
TokenTrust v0.1 -- Token/Context-Reduction Claims Verification
Proxy: rtk 0.43.0 | Repo: . | Task corpus: 23 labeled tasks

[MEASURED] TT01 Compression Ratio
  Claimed (rtk README): up to 70% context reduction (rtk README)
  Measured (this repo, this corpus): 60.7% average reduction across 23 tasks
  Range: 0.0% (task: "verify-go-build-filter") to 95.4% (task: "verify-git-log-filter")

[MEASURED] TT02 Cost-Savings Delta
  Baseline (uncompressed): $0.02 across 23 tasks @ claude-5-sonnet pricing
  Compressed (rtk-proxied): $0.00 across 23 tasks
  Actual savings: 77.2% ($0.01) -- vs. claimed 70% ceiling

[FAIL]  TT03 Never-Worse Output Guard
  2/23 tasks regressed in task-completion diff vs. uncompressed baseline

[PASS]  TT05 Version-Drift Regression Check
  No prior verified baseline for rtk on this repo -- this run establishes the first baseline.

Summary: 77.2% measured cost savings (claimed: up to 70%) -- see full report
Report: ./tokentrust-report-2026-07-17.json
```

That is a real run against the real `rtk 0.43.0` binary and this package's own bundled fixture
corpus, captured on the same machine and the same moment as the equivalent `npx tokentrust-cli
verify --proxy rtk` run of the npm package -- the two distributions produce identical measured
numbers because they run the identical corpus with the identical `cl100k_base` tokenizer.

Exit code is `0` when the run completes with no gated failure (a `--live` cost gate, a
`CorpusMismatchError`, or a task-schema error), non-zero otherwise. A TT03 or TT05 FAIL is
reported in the output but does not by itself change the process exit code -- see
[concepts.md](./concepts.md) for exactly which failure paths are exit-code-gated versus
report-only.

## A one-time network fetch, then fully offline

The first time `tokentrust verify` runs in a fresh environment, the underlying `tiktoken`
library downloads the public `cl100k_base` encoder data from OpenAI's servers and caches it
locally (`~/.cache/tiktoken` by default on Linux/macOS, `TIKTOKEN_CACHE_DIR` if you want to pin
the location, e.g. to pre-warm a CI cache). Every run after that first one is fully offline. This
is the one real behavioral difference from the npm package, whose `js-tiktoken` dependency
bundles the same `cl100k_base` rank data inside the npm tarball itself and needs no network call,
ever. See the "Tokenizer fidelity" section in [README.md](../README.md) for how the two are
verified to produce identical token counts despite this packaging difference.

## Using the library instead of the CLI

```python
from tokentrust.verify import VerifyOptions, VerifyDependencies, run_verify, resolve_default_tasks_path

options = VerifyOptions(
    proxies=["rtk"],
    repo=".",
    tasks_path=resolve_default_tasks_path(),
    live=False,
    confirm_cost=False,
    live_max_tasks=5,
    format="json",
)
outcome = run_verify(options, VerifyDependencies())
print(outcome.exit_code, outcome.report_path)
```

See [examples/](../examples/) for three complete, runnable scripts covering a basic verify run,
a CI gate built on the JSON report, and calling the TT04 cross-tool comparison directly.

## Next steps

- [concepts.md](./concepts.md) -- what each of the five verification categories (TT01-TT05)
  actually measures, and the vendor-neutral verification methodology behind it.
- [integrations/ci.md](./integrations/ci.md) -- wiring TokenTrust into a CI pipeline (the
  bundled GitHub Action for the npm CLI, a plain CI step for the Python CLI).
- The [project README](../README.md) for the full comparison table and how the two
  distributions relate.
