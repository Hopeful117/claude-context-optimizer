# ES-001 — Claude Code Mods feasibility: documentary findings

- Date: 2026-11-17
- Status: **Documentary research; no local runtime validation**
- Source: https://code.claude.com/docs/en/plugins/mods/overview
- Reference: https://code.claude.com/docs/en/plugins/mods/reference

## Confirmed by official documentation

| Requirement | Documentary result | Local verification |
| --- | --- | --- |
| Mod execution | JavaScript/TypeScript event handlers registered via `register(on)` | Pending |
| Claude Desktop Code tab | Supported, except WSL sessions | Pending |
| Minimum versions | CLI 2.1.287; Desktop bundled Claude Code 2.1.286 | Pending |
| Native panel | `$.ui.open` and `ui.render`, including `Pane` and `AbovePrompt` on Desktop | Pending |
| Session lifecycle | `session.start`, `session.end`, `session.compact`, `session.measure` | Pending |
| Turn lifecycle | `turn.start`, `turn.step`, `turn.complete` | Pending |
| Context usage | `$.session.usage()` provides `context.tokens`, `context.window`, `context.percent` | Pending |
| Rate limits | `$.session.usage()` provides `rateLimits` entries with `kind`, `percentUsed`, `resetsAt` | Pending |
| Local shared storage | `$.store.get/set/delete/keys` | Pending |
| Detailed cache read/write counters | Not established by reviewed reference page | Pending |
| Subscription quota accounting | Not established; no extrapolation from token counters | Pending |

The official reference says the local installed TypeScript declarations are authoritative if they differ from the published copy. Inspect those before implementation.

## Proposed spike sequence

1. Run `claude --version` in terminal and `/status` in a Desktop Code local session; capture exact versions.
2. Inspect installed Mod type declarations and official example `token-weather`.
3. Create the minimum manifest + hooks module; load via `--plugin-dir` in a disposable session.
4. Observe `session.measure` and `$.session.usage()` with metadata-only output, never prompt bodies.
5. Render a minimal read-only pane using supported UI APIs.
6. Inspect availability of cache-read/cache-write counters and document unavailable fields honestly.
7. Verify Desktop behavior, reload, safe-mode disable, and measure overhead.

## Security notes

Official docs state Mods execute with the user's permissions, are not sandboxed, and can access prompts, tools, files, secrets, and the network. V1 must minimize capabilities and avoid collecting sensitive content. Hooks should pass events unchanged; no calls to models or remote services.

## Go/no-go

**Documentary feasibility: positive** for native integration, panel, session usage and rate-limit percentages. **Implementation feasibility: pending** actual installed versions, live payloads, detailed cache metrics, and performance checks.

This report does not assert that a plugin was installed or that live events were observed.
