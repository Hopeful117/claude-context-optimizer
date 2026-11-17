# ES-003 — Context Advisor V1: recommendation engine

- Status: **Complete**
- Type: **Implementation**
- Governing decisions: ADR-001, ADR-002, ADR-003
- Depends on: ES-002 (complete)

## Problem

ES-002 established a bounded, session-scoped `MetricsHistory` layer and a clean concern separation between event acquisition, normalization, and rendering. The pane displayed raw metrics (context fill, cache breakdown, rate limits, cost) but offered no actionable guidance.

A user watching the pane had to interpret the numbers themselves. There was no early warning before context reached a critical fill, no signal about cache inefficiency, and no alert for rate-limit proximity.

## Goal

Build a deterministic, explainable advisory engine on top of `MetricsHistory`. The engine runs as pure functions at render time — no LLM calls, no automatic actions, no side effects. Recommendations appear in the pane's "Advisor" section and are suppressed when no condition is active.

## In scope

1. `src/advisor/types.ts` — `Confidence`, `Recommendation`, `AdvisoryResult` types.
2. `src/advisor/rules.ts` — four deterministic heuristic functions:
   - `contextFillRule`: context fill ≥ 70% (medium) or ≥ 85% (high).
   - `cacheEfficiencyRule`: cache read ratio < 30% over the last N turns (medium).
   - `rateLimitRule`: highest rate limit ≥ 75% (medium) or ≥ 90% (high).
   - `contextGrowthRule`: context grew ≥ 15% across the last 3 entries (medium).
3. `src/advisor/engine.ts` — `evaluate(history, rateLimits?)` composing all rules, deduplicating by `id`, sorting by confidence (high → medium → low).
4. `src/advisor/rules.test.ts` — 18 tests covering each rule's null, boundary, and trigger cases.
5. `src/advisor/engine.test.ts` — 5 tests covering empty history, sort order, deduplication, and single-rule activation.
6. `hooks/register.tsx` — Advisor section prepended to the pane render, hidden when no recommendations are active.

## Explicit non-goals

- Automatic compaction or prompt modification.
- LLM-based reasoning or suggestion generation.
- Cross-session recommendation history.
- Subscription quota estimation.
- UI design beyond the existing pane Text/Box layout.

## Architecture decisions

- **Pure functions at render time**: `evaluate()` is called inside `ui.render` from `historyAtom` + `paneAtom.rateLimits`. No additional atom. No background computation.
- **`RateLimitSnapshot[]` passed into `evaluate`**: rate limits live in `PaneSnapshot`, not `HistoryEntry`. Rather than duplicating them in history, the engine accepts them as a second argument.
- **Confidence sort**: `{ high: 0, medium: 1, low: 2 }` guarantees highest-priority items appear first.
- **Recommendation IDs are stable strings**: allows deduplication across rule re-evaluation and future UI features (e.g. dismiss).

## Thresholds (ES-003 V1)

| Rule | Threshold | Confidence |
|---|---|---|
| Context fill | ≥ 85% | high |
| Context fill | ≥ 70% | medium |
| Rate limit | ≥ 90% | high |
| Rate limit | ≥ 75% | medium |
| Cache efficiency | cache_read / total_input < 30% (over last 3 turns) | medium |
| Context growth | ≥ 15% increase over last 3 entries | medium |

## Acceptance criteria

- [x] `src/advisor/types.ts`, `rules.ts`, `engine.ts` exist as pure modules.
- [x] `hooks/register.tsx` calls `evaluate(history, snap.rateLimits)` in `ui.render`; Advisor section hidden when no recommendations.
- [x] `claude plugin validate` passes (warnings only: author, license, icon — no blockers).
- [x] `claude plugin test` runs 45 tests (22 existing + 23 new), 0 failures.
  - Rules: null cases, boundary cases, trigger cases for all four rules.
  - Engine: empty, sort order, deduplication, single-rule, multi-source.

## Tests (new in ES-003)

| Test | File | Covers |
|---|---|---|
| `contextFillRule: null on empty history` | `rules.test.ts` | No data |
| `contextFillRule: null when below medium threshold` | `rules.test.ts` | Below threshold |
| `contextFillRule: null when no contextPercent` | `rules.test.ts` | Absent percent |
| `contextFillRule: medium at threshold` | `rules.test.ts` | Medium trigger |
| `contextFillRule: high at high threshold` | `rules.test.ts` | High trigger |
| `contextFillRule: uses most recent entry` | `rules.test.ts` | Recency |
| `cacheEfficiencyRule: null on insufficient turns` | `rules.test.ts` | Min-turns guard |
| `cacheEfficiencyRule: null when good ratio` | `rules.test.ts` | No trigger |
| `cacheEfficiencyRule: medium when low cache ratio` | `rules.test.ts` | Medium trigger |
| `rateLimitRule: null on empty list` | `rules.test.ts` | No data |
| `rateLimitRule: null below medium threshold` | `rules.test.ts` | Below threshold |
| `rateLimitRule: medium at medium threshold` | `rules.test.ts` | Medium trigger |
| `rateLimitRule: high at high threshold` | `rules.test.ts` | High trigger |
| `rateLimitRule: picks highest percentUsed across kinds` | `rules.test.ts` | Multi-limit |
| `contextGrowthRule: null on empty history` | `rules.test.ts` | No data |
| `contextGrowthRule: null when insufficient entries` | `rules.test.ts` | Min-entries guard |
| `contextGrowthRule: null when growth below threshold` | `rules.test.ts` | No trigger |
| `contextGrowthRule: medium when rapid growth` | `rules.test.ts` | Medium trigger |
| `evaluate: empty history → no recommendations` | `engine.test.ts` | Empty case |
| `evaluate: context fill high → one recommendation` | `engine.test.ts` | Single rule |
| `evaluate: recommendations sorted high before medium` | `engine.test.ts` | Sort order |
| `evaluate: deduplicates by id` | `engine.test.ts` | Dedup |
| `evaluate: rate limit only → rate limit recommendation` | `engine.test.ts` | Rate-limit path |

## Next step (ES-004)

Heuristic calibration and observability:
- Run ES-003 rules across real session history to validate threshold values.
- Add `$.store`-backed cross-session history for trend analysis.
- Surface "last seen" timestamps for each recommendation to prevent alert fatigue.
