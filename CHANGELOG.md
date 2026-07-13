# Changelog

All notable changes to this project are documented in this file.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [0.1.2] - 2026-07-13

### Changed

- **Package renamed from `tokentrust` to `tokentrust-cli`** on the npm registry, and the
  GitHub repo renamed from `TokenTrust` to `TokenTrust-CLI`, to make the project's CLI
  identity explicit for discoverability. The installed command itself is unchanged --
  it's still `tokentrust` (e.g. `npx tokentrust-cli verify --proxy rtk` installs the
  renamed package and runs the same `tokentrust` binary as before). The old `tokentrust`
  package on npm is deprecated and points to `tokentrust-cli`; it is not unpublished.
- Bundled GitHub Action (`action/action.yml`) updated to invoke `npx tokentrust-cli`
  internally instead of the now-deprecated `npx tokentrust`.
- All repo/package references in README, CONTRIBUTING.md, and CLAUDE.md updated to the
  new names.

## [0.1.1] - 2026-07-12

### Changed

- README: updated the Install section and npm badge now that `tokentrust` is
  live on the npm registry -- `npx tokentrust verify --proxy rtk` replaces
  the old "install from source" instructions.

## [0.1.0] - 2026-07-12

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

### Changed

- `RtkAdapter` now invokes rtk's real CLI surface instead of an invented
  `rtk compress --stdin` command that never existed on the real binary:
  `rtk pipe --filter <name>` (stdin-based, for filter-tagged tasks) or
  `rtk read -l aggressive <files>` (file-based, for the 12 original fixture
  tasks), chosen per task. `BaseAdapter` gained an overridable
  `buildCompressInvocation()` hook so each adapter can express this without
  duplicating `run()`'s spawn/error-handling logic.
- Task schema gained an additive, optional `filter` field
  (`fixtures/tasks.yml` / `src/tasks/types.ts`) naming one of rtk's 18 real
  `rtk pipe --filter` values. `loadFixtureContext()` now returns a filter
  task's fixture content completely raw (no `--- path ---` header, no
  `--- PROMPT ---` suffix) so the measured "before" and "after" text match
  the literal shape a real `<tool> | rtk pipe --filter X` invocation sees.
  Omitting `filter` keeps a task's previous file-based behavior unchanged.
- Bundled default corpus grew from 12 to 15 tasks: three new filter-tagged
  tasks (`verify-git-log-filter`, `verify-git-diff-filter`,
  `verify-vitest-filter`) built from real captured `git log`, `git diff`,
  and `vitest run` output from this repo's own history and test suite.
- `--proxy headroom` is now intercepted in `runVerify()`'s dispatch loop,
  before a `HeadroomAdapter` is ever constructed, and prints a documented
  message explaining that headroom's real CLI surface is an HTTP proxy
  server (`headroom proxy`), not a one-shot compression command, so it
  cannot be driven by v0.1's subprocess-based harness. `--proxy headroom`
  remains a recognized flag value; it just doesn't produce a verification
  report yet. `--proxy rtk --proxy headroom` still verifies rtk and
  produces a report -- only headroom is skipped.

### Notes

- TT06 (telemetry/data-handling disclosure) and TT07 (hosted team
  budget/quota enforcement) are out of scope for v0.1 — see the product
  definition in `CLAUDE.md`.
- headroom support (behind a real HTTP-proxy-traffic test harness) and
  lean-ctx support are both out of scope for v0.1.
