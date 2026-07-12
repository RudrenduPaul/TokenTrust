# tokentrust

Vendor-neutral CLI that independently verifies the actual token/cost savings
delivered by AI-coding-agent context-reduction proxies against a real,
labeled task corpus and a local tokenizer.

## Proxy support (v0.1)

| Proxy | Status |
|---|---|
| `rtk` | Fully supported -- real subprocess-based verification (`rtk pipe --filter <name>` for stdin-shaped tasks, `rtk read -l aggressive <files>` for file-based tasks). |
| `headroom` | Recognized (`--proxy headroom` is a valid flag value), not yet supported -- headroom is an HTTP proxy server, not a one-shot compression CLI, so v0.1's subprocess-based harness cannot drive it. `tokentrust verify --proxy headroom` prints a message and skips it instead of failing silently. Planned for a future version behind a real HTTP-proxy-traffic test harness. |
| `lean-ctx` | Recognized, support paused for v0.1. |

Documentation in progress.
