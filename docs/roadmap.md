# Roadmap

## Phase 0 — Feasibility spike ✅ COMPLETE (ES-001, 2026-11-17)

Confirmed: Mod loads on Claude Desktop Code tab; all core metrics available; Pane surface functional. See `docs/investigations/ES-001-mod-feasibility-report.md`.

**Exit gate met:** session ID, context window/fill/tokens, cache breakdown (via `event.usage`), rate limits, cost (Desktop confirmed), `session.measure` and `session.compact` events, `$.store` persistence, Pane UI.

## Phase 1 — Context Advisor foundations (ES-002, in progress)

- **ES-002**: Bounded metrics history, concern separation (normalize / history / pane), unit tests. ← _current_
- Explainable heuristics and uncertainty labels (ES-003, not started).
- Overhead benchmark on a reproducible scenario (deferred from ES-001).

**Exit gate:** reproducible session history, bounded memory, negligible observer overhead, no automatic session changes.

## Phase 2 — Validation

- Baseline vs advisor-assisted comparable tasks.
- Measure task completion, quality, elapsed time, token breakdown, cache behavior, and observed quota indicators where available.
- Investigate false-positive recommendations.

## Future — Context Orchestrator

- Structured handoff drafts and user-confirmed session transitions.
- Policy engine and audit trail.
- Optional supported integrations only after separate ADRs and user approval.

No dates or savings percentages are promised before measurement.
