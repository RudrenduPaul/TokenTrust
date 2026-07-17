# Contributing to TokenTrust

Thanks for looking at TokenTrust's source. This project measures whether a
token/context-reduction proxy actually saves what it claims — so the bar for
"is this change correct" is higher than most CLI tools: every category change
needs a reproducible fixture behind it, not just a passing type-checker.

TokenTrust ships two independently maintained, equally first-class distributions of the same
verifier: an npm package (`tokentrust-cli`, TypeScript, repo root) and a PyPI package
(`tokentrust-cli`, Python, `python/`). Both read the same `fixtures/tasks.yml` corpus (copied
verbatim into the Python wheel) and are expected to produce the same measured numbers against
the same target. Please read this whole file before opening a PR: which section applies
depends on which codebase you're touching.

## Before you start

- This project measures whether a token/context-reduction proxy actually
  saves what it claims, so it holds itself to a few non-negotiable rules: no
  measurement number is reported without a fixture-run behind it, claimed
  vs. measured savings are always kept separate, and cross-tool comparisons
  only ever run across identical corpora.
- A category-logic change (TT01-TT05's measurement or comparison behavior) must be made in
  **both** `src/categories/` (TypeScript) and `python/src/tokentrust/categories/` (Python), with
  equivalent test coverage added to both suites. A category that only exists correctly in one
  language is a silent behavior gap between the two CLIs, so avoid it.
- Run the full check suite locally before opening a PR.

### TypeScript package (repo root)

  ```bash
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run audit
  ```

### Python package (`python/`)

  ```bash
  cd python
  python3 -m venv .venv && source .venv/bin/activate
  pip install -e ".[dev]"
  pytest --cov=tokentrust --cov-report=term-missing
  ```

  Build and verify a real install before opening a PR that touches packaging:

  ```bash
  python3 -m build python --outdir /tmp/tokentrust-dist
  python3 -m venv /tmp/tokentrust-verify && /tmp/tokentrust-verify/bin/pip install /tmp/tokentrust-dist/*.whl
  /tmp/tokentrust-verify/bin/tokentrust verify --proxy rtk
  ```

  Build the venv **outside** `python/` (e.g. in `/tmp`), never inside the source tree. A venv
  built inside `python/` gets accidentally bundled into the sdist by `hatchling`'s default sdist
  target, shipping a bloated, dependency-leaking package.

### Tokenizer parity (Python port)

The Python package's tokenizer wrapper (`python/src/tokentrust/tokenizer/__init__.py`) uses
`tiktoken`'s `cl100k_base` encoding as the equivalent of the npm package's `js-tiktoken`
dependency. Before this port shipped, both were checked against the same sample strings and
produced identical token counts:

```
"hello world, this is a test of the tokenizer"                => 10 tokens (both)
"function calculateTotal() { return a + b; }"                 => 11 tokens (both)
"--- src/foo.js ---\nconst x = 1;\n\n--- PROMPT ---\nFix the bug." => 19 tokens (both)
""                                                              => 0 tokens (both)
```

If you change anything in either tokenizer wrapper, re-verify parity with real sample text
before merging. A silent tokenizer mismatch between the two distributions would produce two
different "measured" numbers for the identical proxy run, which defeats the entire point of a
tool whose job is to verify a number.

## Project layout

```
src/
  cli.ts                 CLI entry point (verify subcommand, flag parsing)
  tasks/                 tokentrust-tasks.yml loader + schema types
  adapters/               ProxyAdapter interface + rtk/headroom adapters
  tokenizer/              local tokenizer wrapper (js-tiktoken)
  categories/             TT01-TT05 verification category logic
    testdata/<category>/clean|vulnerable   labeled fixtures per category
  report/                 JSON + terminal report writers
fixtures/
  tasks.yml               bundled default 23-task corpus
  repos/                  one minimal fixture repo per bundled task
action/
  action.yml               GitHub Action wrapper
python/
  src/tokentrust/          Python port, module-for-module mirror of src/ above
    tokenizer/             local tokenizer wrapper (tiktoken, cl100k_base)
    tasks/                 tokentrust-tasks.yml loader + schema types
    adapters/               ProxyAdapter interface + rtk/headroom adapters
    categories/             TT01-TT05 verification category logic
    report/                 JSON + terminal report writers
    fixtures/               same tasks.yml + repos/, copied verbatim, bundled in the wheel
  tests/                   pytest suite, module-for-module mirror of the vitest suite
  examples/                runnable Python library-API examples
  docs/                    getting-started.md, concepts.md, integrations/ci.md
```

## How to add a verification category

TT01-TT05 are locked for v0.1.
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
   or above **95% coverage** — this is a hard floor for TT01-TT05
   specifically, since a wrong measurement here is the exact failure mode
   this tool exists to catch in other people's tools. Apply the identical
   fix and the identical 95% floor to the matching
   `python/src/tokentrust/categories/tt0N_*.py` file and its
   `python/tests/test_tt0N_*.py` suite (`pytest --cov=tokentrust`).
4. If your change affects a number shown in the README, re-run
   `npx tokentrust-cli verify` against the bundled fixture corpus and update the
   README with the real output — never hand-type a measurement. Do the same
   with `tokentrust verify` (Python CLI, after `pip install -e python/`) for
   any number shown in `python/README.md` or `python/docs/`.

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

`src/adapters/registry.ts` hardcodes the two supported proxies on purpose —
this is a small named registry, not a generic plugin system, because two
known proxies don't need one.
Adding a third proxy means:

1. Implement the `ProxyAdapter` interface (`src/adapters/types.ts`) in a new
   `src/adapters/<name>.ts` file, following the pattern in `rtk.ts` /
   `headroom.ts`. Implement the matching `ProxyAdapter` ABC
   (`python/src/tokentrust/adapters/types.py`) in a new
   `python/src/tokentrust/adapters/<name>.py` file, following `rtk.py` /
   `headroom.py`.
2. Register it in `src/adapters/registry.ts` **and**
   `python/src/tokentrust/adapters/registry.py`.
3. Add adapter-level tests covering: `isInstalled()`/`is_installed()`
   true/false, `run()` happy path, and the missing-binary error path (this
   is a CRITICAL path that must stay covered), in both `*.test.ts` and the
   matching `python/tests/test_adapters.py`/`test_base_adapter.py`.
4. Changes that alter how token counts, cost deltas, or regression
   thresholds are computed deserve a short written plan before you start
   implementing, and must land in both `src/categories/` and
   `python/src/tokentrust/categories/` together. See "Tokenizer parity"
   above for why a silent divergence here is worse than in most ports.

## Commit and PR expectations

- Every category or measurement-logic change needs a fixture behind it —
  never report a measurement number without a fixture run actually
  producing it.
- Don't suppress lint or type errors without a comment explaining why.
- Update `CHANGELOG.md` for any change to public CLI behavior, flags, or
  report schema.
