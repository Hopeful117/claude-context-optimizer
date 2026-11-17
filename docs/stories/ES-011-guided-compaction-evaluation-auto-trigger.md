# ES-011 — Guided Compaction: Comparative Evaluation + Auto Trigger

- Status: **In Progress**
- Date: 2026-11-17
- Branch: `feat/es-011-guided-compaction-evaluation-auto-trigger`
- Base: `main` (v0.9.0 — ES-010 merged)
- Version: `1.0.0`

---

## Objective

Complete Phase 3 of the Guided Compaction initiative:

1. **Comparative evaluation** — formally validate that guidance improves context continuity (Group A vs Group B, ≥3 events each). Produces the Go/No-Go for auto trigger extension.
2. **Auto trigger extension** — extend guidance to engine-initiated compactions (`auto` trigger) under a separate opt-in toggle (`autoGuideEnabled`), governed by ADR-004.

Architecture authority: ADR-004 (`docs/architecture/ADR-004-user-controlled-compaction-intelligence.md`) — Accepted.

---

## Prerequisites

- ES-010 Validated (H1 confirmed 2026-11-17) ✅
- ADR-004 Accepted ✅

---

## What Was Built

### ADR-004

`docs/architecture/ADR-004-user-controlled-compaction-intelligence.md` — trigger policy, two-toggle consent model, fail-open invariant, status line spec.

### Comparative Evaluation

Protocol: `docs/investigations/ES-011-comparative-evaluation-protocol.md`
Results: `docs/investigations/ES-011-comparative-evaluation-results.md`

### Auto Trigger Extension

#### Type change: `types/index.d.ts`

Added `autoGuideEnabled: boolean` to `PaneSnapshot`. Shape bumped to `pane-3`.

#### Hook change: `hooks/register.tsx`

`session.compact` handler extended:
- Reads `paneAtom.autoGuideEnabled` alongside `guideEnabled`.
- If `autoGuideEnabled` AND trigger is `auto`: injects guidance.
- Status line: `ctx:guided-compacted(auto)` when auto guidance was applied.
- Fail-open: any error falls back to `next(event)` unchanged.

#### Pane render

Added second toggle in "Compaction Guidance (prototype)" section:
- `● Auto active` (primary variant) / `○ Auto disabled` (default).

#### Session reset

`session.start` / `session.end` reset `autoGuideEnabled: false`.

---

## Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| AC-1 | `autoGuideEnabled` defaults to `false`; no behavior change without opt-in | Verified in atom default + session reset |
| AC-2 | On `auto` trigger with `autoGuideEnabled=true`: instructions contain template | Hook logic verified |
| AC-3 | On `auto` trigger with `autoGuideEnabled=false`: instructions unchanged | Trigger guard verified |
| AC-4 | `guideEnabled=true` + `auto` trigger does NOT inject guidance | Separate condition verified |
| AC-5 | On `precompute` trigger: instructions unchanged regardless of both flags | Trigger exclusion verified |
| AC-6 | On error in composition for `auto`: fail-open | Fail-open try/catch |
| AC-7 | Pane shows second toggle with correct state | Button variant=primary/default |
| AC-8 | `autoGuideEnabled` resets on session start/end | Reset handlers verified |
| AC-9 | All existing tests pass unchanged | To be verified |
| AC-10 | TypeScript compilation has no new errors | To be verified |

---

## Go/No-Go for ES-012

Depends on comparative evaluation results. See `docs/investigations/ES-011-comparative-evaluation-results.md`.

---

## Related

- ADR-004: `docs/architecture/ADR-004-user-controlled-compaction-intelligence.md`
- ES-010: `docs/stories/ES-010-guided-compaction-prototype.md`
- Evaluation protocol: `docs/investigations/ES-011-comparative-evaluation-protocol.md`
