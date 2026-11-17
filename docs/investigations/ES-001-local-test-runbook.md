# ES-001 — Minimal Mod local test runbook

**Status:** prepared, not tested on the user's machine. Assume current Claude Desktop version for planning, but do not claim compatibility until the plugin loads.

## Scope

This first prototype uses only three documented Mod hooks: `turn.complete`, `session.measure`, and `ui.render` for the spinner. It counts events in memory, does not read or persist session content, and does not invoke an LLM or network.

## Test

1. Clone this PR branch to a local directory.
2. If a Claude Code CLI is available, run `claude plugin validate .` from the repository root. Record any errors.
3. Start a disposable terminal session with `claude --plugin-dir /absolute/path/to/claude-context-optimizer`. If testing in Desktop instead, use its supported local-plugin installation flow; do not assume a CLI `--plugin-dir` flag applies to Desktop.
4. Check `/plugin` for the loaded mod, then make a harmless request. Observe whether the spinner shows the Context Optimizer counter. The spinner is only visible while Claude is working.
5. Record whether `session.measure` increments and whether `turn.complete` increments after the turn. Test a second turn.
6. Disable or unload the plugin if it fails, and capture the exact error and host/version information if available.

## Pass/fail

- PASS: plugin loads and its counters update in a live local session.
- PARTIAL: plugin loads but the spinner is not displayed or an event is absent; document host differences.
- FAIL: plugin does not validate or load; capture diagnostics and inspect installed type declarations.

## Next iteration

After this basic event-hook test passes, use `$.session.usage()` and a native pane to display context-window and rate-limit metrics, then investigate cache counters. Do not infer cache usage or quotas from unavailable fields.

Official docs: https://code.claude.com/docs/en/plugins/mods/overview and https://code.claude.com/docs/en/plugins/mods/reference
