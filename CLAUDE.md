# CLAUDE.md -- tokentrust

## Project Identity

- **Idea:** Vendor-neutral CLI that independently verifies the actual token/cost
  savings delivered by AI-coding-agent context-reduction proxies (rtk, headroom,
  lean-ctx) against a real, labeled task corpus and a local tokenizer -- free/OSS
  benchmark harness, plus a paid hosted team-verification/budget-governance tier
  (v0.2, out of scope for this repo today)
- **Repo:** RudrenduPaul/TokenTrust-CLI
- **Distribution:** npx-installable CLI, published to npm as `tokentrust-cli` (npx
  tokentrust-cli verify; the installed command itself is still `tokentrust`), global
  npm install, plus a GitHub Action wrapper for CI-triggered re-verification on proxy
  version bumps
- **Language:** TypeScript/Node. This is a runtime choice for TokenTrust itself, not
  a claim that the supported proxies share this ecosystem -- they don't: `rtk` is a
  Rust binary (single static binary, no Node runtime), `headroom` is a Python package
  (PyPI `headroom-ai`), and `lean-ctx` is a Rust binary. TokenTrust shells out to all
  three as external processes via `child_process.spawn` and counts tokens on the text
  that flows through, which is runtime-agnostic. TypeScript/Node is the right choice
  because it enables a local, dependency-free tokenizer (`js-tiktoken`, a pure-JS port
  of OpenAI's tiktoken) with zero per-run inference cost, and it's a natural fit for
  an npx-installable CLI.
- **License:** Apache 2.0 (core benchmark harness, TT01-TT05 categories, local/JSON
  report output, fixture corpus) + proprietary (hosted scheduled re-verification,
  team dashboard, budget/quota alerts, historical trend export -- v0.2, not in this
  repo)
- **Prior art:** [tokbench](https://github.com/Entelligentsia/tokbench) ran a smaller,
  rigorous, one-time pilot comparing rtk, headroom, and lean-ctx against real
  provider-billed token totals. TokenTrust doesn't claim to be first -- it's the
  ongoing, installable, self-serve counterpart: tokbench answers "did these three
  proxies help on one fixed task, once," TokenTrust answers "is the proxy I'm using
  still helping, on my code, this week, this CI run." Credit tokbench's methodology
  explicitly wherever this project's own methodology is documented.
- **Repo goal:** Become the reference independent verification layer for AI-coding-
  agent token-reduction proxy claims, proven first by extending rtk issue #839's own
  community-built benchmark methodology, then established as the one source neither
  rtk, headroom, lean-ctx, nor a funded AI-FinOps vendor has the disinterested
  incentive to build well.

## Git Workflow

When asked to commit, push, or "update GitHub" -- just do it. No questions.

- `git add` relevant files -> `git commit` -> `git push origin main` in one shot
- Never use `Co-Authored-By:` lines.

## Engineering Standards (block all tasks until these pass)

1. **Lint:** `eslint . --max-warnings 0`
2. **Typecheck:** `tsc --noEmit` -- zero errors
3. **Tests:** `vitest run --coverage` -- 80% minimum overall; 95%+ on every
   verification-category file (`src/categories/tt01_*.ts` through `tt05_*.ts`)
   since a wrong measurement here is the exact failure mode this tool exists to
   catch in other people's tools
4. **Security:** `npm audit --audit-level=high` -- no unfixed HIGH/CRITICAL CVEs in
   the dependency tree (a claims-verification tool with a vulnerable dependency
   tree is an immediate credibility problem)
5. **Measurement reproducibility:** every category change must re-run
   `src/categories/testdata/` fixtures and confirm published example numbers in the
   README still match a fresh run -- a stale README number is a false claim about a
   tool built to catch exactly that

Do NOT mark a task complete if any of these fail. Fix the root cause. Do not suppress
errors or add `// eslint-disable` without a comment explaining why.

## Planning Rules

Enter plan mode for any task that:
- Touches more than 2 files
- Adds or changes a verification category in TT01-TT07
- Changes how token counts, cost deltas, or regression thresholds are computed
- Adds support for a new proxy tool

Write the plan before touching code. If something goes wrong mid-task, stop and re-plan.

## Anti-Sycophancy Rules

These override default behavior in every session:

1. **No compression-ratio, cost-savings, or detection number without a fixture-run
   command output shown.** Before stating any measured number, run the relevant
   category against `src/categories/testdata/` and show the command output. Never
   state a number without showing the command that produced it.
2. **Never report a proxy's claimed number as this tool's own finding.** Every report
   must clearly separate "claimed (source: README/marketing)" from "measured (this
   run, this corpus)" -- conflating the two defeats the entire purpose of the tool.
3. **Never overstate statistical confidence from a small task corpus.** A 12-task
   fixture run is a directional measurement, not a statistically powered claim across
   all repos and workloads -- state corpus size and task diversity in every report,
   and recommend the user extend the corpus with their own tasks for higher confidence
   on their specific codebase.
4. **Comparison claims require the identical task corpus.** A cross-tool comparison
   (TT04) is only valid if every compared proxy ran the exact same labeled tasks under
   the exact same conditions -- never publish or imply a comparison across
   non-identical corpora.
5. **Vendor-neutrality check.** Before merging any change to a verification category,
   ask: "does this change make any one supported proxy look artificially better or
   worse than the others?" If the honest answer is yes and it is not because of a real,
   reproducible measurement difference, do not merge.
6. **Never claim a "PASS" on TT03 (never-worse guard) means a proxy never degrades
   output quality generally.** A PASS means the current task corpus did not detect a
   regression on this run -- it is not a guarantee across all possible tasks. State
   this limitation plainly in every generated report.
7. **`--live` mode never fires an API call without an explicit flag AND an explicit
   cost estimate shown first.** `--live` alone always prints a cost estimate and
   refuses to call any API. Only `--live --confirm-cost` together may proceed, capped
   at `--live-max-tasks` (default 5). The API key is read from an environment variable
   only, never a CLI flag.

## What Claude Must Never Do

- Claim a compression-ratio or cost-savings number without a fixture-run command output
- Ship a new verification category without a labeled fixture test case and a
  documented measurement methodology
- Commit with `--no-verify`
- Merge a PR that regresses category-file test coverage below 95% without explicit
  written approval
- Present a proxy's own marketing claim as this tool's independent finding
- Publish a cross-tool comparison across non-identical task corpora
- Let a `--live` API call fire without both `--live` and `--confirm-cost` present
- State this project exists for fundraising or investor-outreach purposes, anywhere

## Key Files

| File | Purpose |
|---|---|
| `src/cli.ts` | CLI entry point -- `verify`, `--proxy` (repeatable), `--repo` (default cwd), `--tasks` (default bundled corpus), `--live`, `--confirm-cost`, `--live-max-tasks`, `--format` |
| `src/tasks/loader.ts` | Reads and validates `tokentrust-tasks.yml` against the locked schema |
| `src/adapters/types.ts` | `ProxyAdapter` interface + `AdapterResult` |
| `src/adapters/rtk.ts` | Shells out to the `rtk` Rust binary |
| `src/adapters/headroom.ts` | Shells out to the `headroom` Python CLI (`pip install headroom-ai`) |
| `src/adapters/lean-ctx.ts` | Shells out to the `lean-ctx` Rust binary |
| `src/adapters/registry.ts` | Small named registry -- 3 known proxies, not a generic plugin system |
| `src/categories/tt01_compression_ratio.ts` | TT01 -- real-tokenizer compression-ratio measurement |
| `src/categories/tt02_cost_delta.ts` | TT02 -- dollar-cost-savings computation, default local pricing + opt-in `--live` verification |
| `src/categories/tt03_never_worse_guard.ts` | TT03 -- task-completion regression check |
| `src/categories/tt04_cross_tool_benchmark.ts` | TT04 -- same-corpus, multi-proxy comparison |
| `src/categories/tt05_version_drift.ts` | TT05 -- regression detection vs. last-verified baseline |
| `src/tokenizer/index.ts` | Local, dependency-free tokenizer wrapper (js-tiktoken) |
| `src/report/json.ts` | Machine-readable JSON report writer |
| `src/report/terminal.ts` | Human-readable terminal report, with a progress indicator during measurement |
| `src/categories/testdata/` | Labeled task corpus, source of every published measurement claim |
| `fixtures/` | Bundled default 12-task corpus, used when `--tasks` is omitted |
| `action/` | GitHub Action wrapper for CI-triggered re-verification |
| `CONTRIBUTING.md` | Read before any contributor-facing change |
| `SECURITY.md` | CVE disclosure policy |
| `CHANGELOG.md` | Updated on every PR that changes public behavior |
| `.github/workflows/ci.yml` | lint -> typecheck -> test -> npm audit |

## Session Start Checklist

1. Run `git status` and `git log --oneline -5` to understand current state
2. Run `npm run test:coverage` to confirm baseline is green before touching anything
3. Read `CHANGELOG.md` last entry to understand what changed recently
4. If a measurement bug is reported: write a failing labeled fixture that reproduces
   it first, then fix the category logic
5. Check: has rtk, headroom, or lean-ctx shipped a first-party verify/benchmark
   feature? Has a funded AI-FinOps vendor (Vantage, Finout, Amnic, Langfuse, Revenium)
   added a comparable proxy-verification SKU? If yes, check whether the
   differentiation framing in the README needs updating.
