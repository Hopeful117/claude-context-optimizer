# AGENTS.md — Claude Context Optimizer

This file provides authoritative project context for AI coding assistants (Claude Code, OpenCode, Codex, etc.) working in this repository.

---

## Project Purpose

A **Claude Code plugin** (mod) that renders a live context-window dashboard inside the Claude Desktop app. It observes session events (`session.start`, `turn.complete`, `session.measure`, `session.compact`) and displays context fill, token breakdown, cache diagnostics, advisor recommendations, and compaction guidance controls in a persistent side pane.

**Current version:** v1.0.2 (ES-013 — Guided Compaction Stabilization)

---

## Stack

- **Language:** TypeScript (strict)
- **Runtime:** Claude Code plugin SDK (`claude-code` package)
- **Rendering:** JSX via the SDK's `$.ui` surface (Pane, Button, Box, Text components)
- **Persistence:** `$.store` via typed `atom()` calls — no external DB, no network
- **Tests:** Vitest
- **Build:** TypeScript compiler (`tsc`)

See `docs/architecture/ADR-001-integration-and-stack.md` for the full stack decision.

---

## Repository Layout

```
hooks/
  register.tsx       # Plugin entry point — all event handlers and pane renderer
  hooks.json         # Plugin manifest

src/
  metrics/           # Normalization, history, bounded ring-buffer
  advisor/           # Deterministic recommendation engine (heuristic rules)
  guide/             # Compaction guidance template + instruction composer
  pane/              # Fill trend calculation, evidence formatting
  perf/              # In-memory timing accumulator

types/
  index.d.ts         # Public PluginState contract (PaneSnapshot, MetricsHistory)

docs/
  architecture/      # ADRs (authoritative design decisions)
  stories/           # Engineering Stories (ES-001 … ES-012)
  investigations/    # Feasibility and evaluation reports
  roadmap.md         # Phase-by-phase progress
  vision.md          # Long-term product direction
```

---

## Key Invariants

1. **Observer only.** The plugin must never trigger, cancel, or alter session behavior except on explicit user action (pane button press). It must never introduce latency to the event pipeline — always call `next(event)` from a `finally` block or equivalent.

2. **Fail-open.** Every event handler wraps its body in `try/catch`. Errors are caught silently; a status update failure must never stall the pipeline. The plugin is non-essential observability infrastructure.

3. **Privacy.** No conversation content (messages, tool calls, file contents, instructions strings beyond compaction guidance) is stored, logged, or transmitted. See ADR-002.

4. **Deterministic recommendations.** The advisor engine uses heuristic threshold rules only. No LLM calls, no network, no randomness. See ADR-003.

5. **Atom discipline.** Each `atom()` call has a stable `{ plugin, key }` identity and a typed `shape` string. Bumping the shape string clears persisted state for that key. Never reuse a shape string with a different data structure.

6. **No automatic compaction.** The plugin must never call `$.session.compact()` autonomously. Compaction is always user-initiated. See ADR-004.

---

## Engineering Workflow

Stories follow the **Engineering Story workflow** (`.claude/skills/engineering-story`):

1. Repository Analysis → **Gate 1: human approval**
2. Implementation Plan → **Gate 2: human approval**
3. Implementation → Documentation Reconciliation → Code Review → Engineering Report → PR

Story files live in `docs/stories/ES-NNN-*.md`.

DevLog configuration is in `TOOLS.md` (this repository's DevLog project slug: `claude-context-optimizer`).

---

## Current Work

- **ES-010** merged on `main` (v0.9.0) — Guided Compaction Prototype with pane toggle. ✅
- **ES-011** code merged (v1.0.0) — Auto trigger extension implemented. Comparative evaluation (Group A vs B, ≥3 compaction events) **not yet run** — pending.
- **ES-012** merged (v1.0.1) — Persistent Guidance Toggle State (`rememberPrefs`, `prefsAtom`). ✅
- **ES-013** in progress (v1.0.2) — Guided Compaction Stabilization (ANO-001–ANO-006 fixes).

---

## Testing

```bash
claude plugin test .   # run Vitest suite (Claude Code SDK test runner)
```

> **Note:** This repository has no `package.json`. The test runner is `claude plugin test .`, not `npm test`.

All new behavior must have unit tests. Quality gate: zero TypeScript errors, all tests pass.
