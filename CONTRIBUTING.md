# Contributing to TokenTrust

Thanks for looking at TokenTrust's source. This project measures whether a
token/context-reduction proxy actually saves what it claims — so the bar for
"is this change correct" is higher than most CLI tools: every category change
needs a reproducible fixture behind it, not just a passing type-checker.

## Before you start

- Read `CLAUDE.md` in the repo root — it has the engineering standards and
  anti-sycophancy rules this project holds itself to (no measurement number
  without a fixture-run behind it, claimed vs. measured always kept separate,
  cross-tool comparisons only across identical corpora).
- Run the full check suite locally before opening a PR:

  ```bash
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run audit
  ```

## Project layout

```
src/
  cli.ts                 CLI entry point (verify subcommand, flag parsing)
  tasks/                 tokentrust-tasks.yml loader + schema types
  adapters/               ProxyAdapter interface + rtk/headroom/lean-ctx adapters
  tokenizer/              local tokenizer wrapper (js-tiktoken)
  categories/             TT01-TT05 verification category logic
    testdata/<category>/clean|vulnerable   labeled fixtures per category
  report/                 JSON + terminal report writers
fixtures/
  tasks.yml               bundled default 15-task corpus
  repos/                  one minimal fixture repo per bundled task
action/
  action.yml               GitHub Action wrapper
```

## How to add a verification category

TT01-TT05 are locked for v0.1 (see the architecture notes in `CLAUDE.md`).
Adding a **new** category (TT06+) is a v0.2+ discussion — open an issue first
so the methodology gets reviewed before code is written. If you're fixing or
extending an existing category:

1. Write a failing fixture first under `src/categories/testdata/<category>/`
   that reproduces the bug or exercises the new behavior. Every category
   directory follows the same `clean/` (nothing wrong, category should
   PASS or show no gap) vs. `vulnerable/` (category should FAIL or detect a
   real gap) convention — add your fixture to whichever side matches the
   behavior you're testing.
2. Fix or extend the category logic in `src/categories/tt0N_*.ts`.
3. Re-run `npm run test:coverage` and confirm the category file is still at
   or above **95% coverage** — this is a hard floor for TT01-TT05 specifically
   (see `CLAUDE.md`, "Engineering Standards"), since a wrong measurement here
   is the exact failure mode this tool exists to catch in other people's
   tools.
4. If your change affects a number shown in the README, re-run
   `npx tokentrust-cli verify` against the bundled fixture corpus and update the
   README with the real output — never hand-type a measurement.

## How to add a fixture task

The bundled default corpus lives in `fixtures/tasks.yml`, with one fixture
repo per task under `fixtures/repos/<task-id>/`. To add a task:

1. Pick a `difficulty` (`easy` / `medium` / `hard`) and a `type`
   (`bugfix` / `refactor` / `docstring` / `feature-add`) that isn't
   already over-represented in the corpus — the corpus is meant to stay
   diverse across both dimensions.
2. Create `fixtures/repos/<task-id>/` with a small, realistic code sample —
   not synthetic placeholder text. A single real file with a real bug,
   a real docstring gap, or a real refactor opportunity is enough; keep it
   small enough that a task run stays fast.
3. Add an entry to `fixtures/tasks.yml` following the locked schema:

   ```yaml
   - id: your-task-id
     description: "One-line description of what the task asks for"
     fixture_repo: ./fixtures/repos/your-task-id
     prompt: "The exact instruction a coding agent would receive"
     difficulty: easy   # easy | medium | hard
     type: bugfix        # bugfix | refactor | docstring | feature-add
   ```

4. If your task is meant to exercise TT03 (never-worse output guard), add an
   optional `quality_markers` list — strings that must still be present in
   the compressed output for the task to pass the guard. This is an additive
   field on top of the locked schema (`version`, `id`, `description`,
   `fixture_repo`, `prompt`, `difficulty`); omitting it is always valid.
5. Run `npx tokentrust-cli verify --proxy rtk --tasks ./fixtures/tasks.yml` and
   confirm your new task produces a sane, reproducible result before opening
   a PR.

## How to add support for a new proxy

`src/adapters/registry.ts` hardcodes the three supported proxies on purpose
(see `CLAUDE.md` and the architecture notes — this is a small named registry,
not a generic plugin system, because three known proxies don't need one).
Adding a fourth proxy means:

1. Implement the `ProxyAdapter` interface (`src/adapters/types.ts`) in a new
   `src/adapters/<name>.ts` file, following the pattern in `rtk.ts` /
   `headroom.ts` / `lean-ctx.ts`.
2. Register it in `src/adapters/registry.ts`.
3. Add adapter-level tests covering: `isInstalled()` true/false, `run()` happy
   path, and the missing-binary error path (this is a CRITICAL path — see the
   test plan referenced in `CLAUDE.md`).
4. This is a "changes how token counts, cost deltas, or regression thresholds
   are computed" — style change per `CLAUDE.md`'s planning rules: write a
   short plan before implementing.

## Commit and PR expectations

- Every category or measurement-logic change needs a fixture behind it —
  see `CLAUDE.md`'s anti-sycophancy rule 1.
- Don't suppress lint or type errors without a comment explaining why.
- Update `CHANGELOG.md` for any change to public CLI behavior, flags, or
  report schema.
