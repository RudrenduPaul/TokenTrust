# Security Policy

## Supported Versions

TokenTrust is currently in v0.1.x (pre-1.0). Security fixes are applied to the
latest published `0.1.x` release on npm. There is no long-term-support branch
yet at this stage of the project.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

If you find a security vulnerability in TokenTrust, please report it privately
rather than opening a public GitHub issue.

- **Email:** security@tokentrust.dev
- **Response time:** we aim to acknowledge every report within **48 hours**.
- **Disclosure:** please give us a reasonable window to investigate and ship a
  fix before any public disclosure. We will credit reporters (unless you ask
  to stay anonymous) once a fix is released.

When reporting, please include:

1. A description of the vulnerability and its potential impact.
2. Steps to reproduce (a minimal repro is ideal — TokenTrust ships a fixture
   corpus under `fixtures/` and `src/categories/testdata/` you can use as a
   base).
3. The TokenTrust version and Node.js version you're running.
4. Any proxy adapter involved (`rtk`, `headroom`, `lean-ctx`), if relevant —
   for example, a vulnerability triggered by a proxy's output reaching the
   tokenizer or the report writer.

## Scope

TokenTrust shells out to external proxy binaries (`rtk`, `headroom`,
`lean-ctx`) as unprivileged child processes and never sends task content,
repo data, or measurement results to any third party unless you explicitly
opt into `--live` mode with your own API key. Security reports involving
credential handling, command injection through task/fixture input, or JSON
report parsing are especially high priority.

Vulnerabilities in the third-party proxy binaries themselves (`rtk`,
`headroom`, `lean-ctx`) are out of scope for this repository — please report
those directly to the respective project.

## Our Commitment

We run `npm audit --audit-level=high` on every pull request and do not ship a
release with an unfixed HIGH or CRITICAL severity CVE in the dependency tree.
