# Changelog

All notable changes to this project are documented in this file.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased] — v0.1.0

### Added

- `tokentrust verify` CLI — benchmark harness for token/context-reduction
  proxies (`rtk`, `headroom`, `lean-ctx`), with `--proxy` (repeatable),
  `--repo` (defaults to the current working directory), `--tasks` (defaults
  to the bundled 12-task corpus), `--live`, `--confirm-cost`,
  `--live-max-tasks`, and `--format` flags.
- TT01 Compression Ratio Verification — measures actual context-token
  reduction with a local tokenizer against a labeled task corpus.
- TT02 Cost-Savings Delta — computes actual dollar-cost savings at
  published model pricing from TT01's measured token delta. Ships an
  opt-in `--live` mode that verifies the local-tokenizer estimate against a
  real, provider-billed sample — gated behind `--confirm-cost` and a
  default 5-task cap (`--live-max-tasks`), with the API key read only from
  an environment variable, never a CLI flag.
- TT03 Never-Worse Output Guard — checks whether a proxy's compressed
  output drops content a task's fixture marks as required to survive
  compression.
- TT04 Cross-Tool Comparative Benchmark — runs the identical task corpus
  through every supported proxy side by side; errors if the compared
  proxies were not run against identical corpora.
- TT05 Version-Drift Regression Detection — compares a run's measured
  savings against the last-verified baseline for the same proxy/repo pair,
  chained via `prior_run_id`; degrades gracefully to "no drift comparison
  available" if the local report store is missing or corrupted.
- `ProxyAdapter` interface and three concrete adapters (`rtk`, `headroom`,
  `lean-ctx`), each shelling out to its proxy as an external process.
- Local, dependency-free tokenizer wrapper (`js-tiktoken`), with a named
  failure path for malformed/non-UTF8 input (WARN + skip, never crash the
  batch).
- Structured JSON report writer (`run_id`, `proxy`, `proxy_version`,
  `category`, `claimed_savings_pct`, `measured_savings_pct`,
  `task_corpus_size`, `prior_run_id`) and a human-readable terminal report
  with a live progress indicator during the measurement phase.
- Bundled default 12-task fixture corpus (`fixtures/tasks.yml` +
  `fixtures/repos/`), varying difficulty and task type, so
  `npx tokentrust verify --proxy rtk` works with zero other flags.
- GitHub Action wrapper (`action/action.yml`) for CI-triggered
  re-verification on proxy version bumps.
- CI workflow (lint → typecheck → test → npm audit) and a tagged-release
  npm publish workflow.

### Notes

- TT06 (telemetry/data-handling disclosure) and TT07 (hosted team
  budget/quota enforcement) are out of scope for v0.1 — see the product
  definition in `[redacted]`.
