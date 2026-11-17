# ES-002 — Context Advisor V1: observability foundations

- Status: **In progress**
- Type: **Implementation**
- Governing decisions: ADR-001, ADR-002, ADR-003
- Depends on: ES-001 (complete)

## Problem

ES-001 confirmed that the Mod API exposes reliable metrics in Claude Desktop Code tab. The spike prototype (`register.tsx`) accumulated all logic in a single file: event wiring, metric normalization, pane rendering. There is no history of observations across a session — only a "current state" snapshot — and the metric semantics (instantaneous vs cumulative, per-turn vs session) are not explicitly modelled.

Without a typed, bounded history layer, it is impossible to build deterministic heuristics (e.g. "context grew 15% in the last 3 turns") or to reason about trends. Without concern separation, adding an analysis layer would require modifying the event wiring and the UI in the same file.

## Goal

Introduce the minimum technical foundation for a session-scoped, bounded metrics history, with clean separation between event acquisition, normalization, and rendering. Do not build the recommendation engine yet.

## In scope

1. Document the precise semantics of each exposed metric (instantaneous vs cumulative, scope, absent conditions) — required before any aggregation.
2. Introduce `src/metrics/types.ts`: shared types for `HistoryEntry` and `MetricsHistory`.
3. Introduce `src/metrics/normalize.ts`: pure functions mapping raw event data to `HistoryEntry`.
4. Introduce `src/metrics/history.ts`: pure functions for bounded history management.
5. Refactor `hooks/register.tsx` into a thin wiring layer that imports from `src/metrics/`.
6. Update `types/index.d.ts` with the new atom state contract (`history` + `pane` atoms, self-contained).
7. Add unit tests covering normalization, absent values, chronological order, retention, session isolation, compaction, and subagent identification.
8. Update ES-001 story and feasibility report with confirmed findings.
9. Update roadmap and README to reflect completed Phase 0.
10. Remove `hooks/register.js` (obsolete JS prototype, not referenced by `hooks.json`).

## Explicit non-goals

- Recommendation or advisory engine (ES-003 or later).
- Cross-session history persistence via `$.store`.
- Overhead benchmarks (no repeatable baseline available; protocol documented in ES-001 §9).
- Subscription quota estimation.
- Automatic compaction or prompt modification.
- UI redesign or additional pane panels.

## Metric semantics (findings from ES-001 and type analysis)

| Field | Scope | Cumulative? |
|---|---|---|
| `context.tokens` | Total input of last API response (uncached + cache_read + cache_write). Instantaneous. | No |
| `context.percent` | `tokens / window × 100`, rounded. Instantaneous. Absent post-compact until next response. | No |
| `context.window` | Model's declared window. Stable. | Stable |
| `event.usage.input_tokens` | Uncached input only, summed across all model calls in the turn. Per-turn. | No |
| `event.usage.cache_read_input_tokens` | Cache hits, summed across all model calls in the turn. Per-turn. | No |
| `event.usage.cache_creation_input_tokens` | Cache writes, summed across all model calls in the turn. Per-turn. | No |
| `event.usage.output_tokens` | Output tokens, summed across all model calls in the turn. Per-turn. | No |
| `cost.usd` | Session-cumulative total. Reset by `/clear`. | Yes |
| `rateLimits[].percentUsed` | Instantaneous snapshot from last API response. | No |

**Do not sum per-turn token fields across turns** — the growing context means each turn's input is larger than the previous one; naive summing double-counts context growth as "usage". Use `cost.usd` as the session-level cost signal.

**Subagent identification:** `turn.complete.agentId` is present for subagent turns, absent for the main loop. `$.session.usage()` without `agentId` always returns the main session's context.

**Post-compaction gap:** `context.tokens` and `context.percent` are absent after compaction until the next API response. History entries during this gap have `contextTokens: null`.

## Architecture decisions

- **Two atoms** per session: `paneAtom` (reactive display state, drives UI) and `historyAtom` (bounded history, available for future analysis).
- **Pure functions** in `src/metrics/`: no engine calls, no side effects — fully testable with `claude plugin test`.
- **Bounded at `MAX_HISTORY = 100` entries** (FIFO). Session-scoped (atom resets on `session.start`). No `$.store` persistence for history in V1.
- **`types/index.d.ts` self-contained**: the engine requires no `import` statements in the PluginState contract file.

## Acceptance criteria

- [x] Metric semantics documented with explicit instantaneous/cumulative distinction.
- [x] `src/metrics/types.ts`, `normalize.ts`, `history.ts` exist as pure modules.
- [x] `hooks/register.tsx` imports from `src/metrics/`; event wiring is thin (no inline aggregation logic).
- [x] `claude plugin validate` passes (warnings only: author, license, icon — no blockers).
- [x] `claude plugin test` runs 22 tests, 0 failures.
  - Normalization: present fields, absent fields, zero values, all event kinds.
  - History: chronological order, FIFO retention, immutability, compaction, session isolation, no double-counting.
- [x] Pane continues to render correctly on Desktop (turned, measured, compacted verified in ES-001).
- [x] `hooks/register.js` removed (not referenced).
- [ ] Overhead benchmark: deferred — no repeatable baseline. Protocol in `ES-001-mod-feasibility-report.md §9`.

## Tests

| Test | File | Covers |
|---|---|---|
| `normalizeContext: maps present fields` | `normalize.test.ts` | Present optional fields |
| `normalizeContext: absent fields → null` | `normalize.test.ts` | Absent optionals |
| `normalizeContext: undefined → null` | `normalize.test.ts` | Undefined coercion |
| `normalizeTurnUsage: null → null` | `normalize.test.ts` | Absent usage |
| `normalizeTurnUsage: maps all fields` | `normalize.test.ts` | Full usage mapping |
| `normalizeTurnUsage: zero preserved` | `normalize.test.ts` | Zero ≠ absent |
| `makeEntry: turn entry with usage` | `normalize.test.ts` | Turn kind |
| `makeEntry: compact entry` | `normalize.test.ts` | Post-compact null context |
| `makeEntry: subagent turn` | `normalize.test.ts` | Subagent flag + agentId |
| `makeEntry: measure entry` | `normalize.test.ts` | Measure kind |
| `makeHistory: starts empty` | `history.test.ts` | Initial state |
| `appendEntry: chronological order` | `history.test.ts` | Ordering |
| `appendEntry: drops oldest at capacity` | `history.test.ts` | FIFO retention |
| `appendEntry: immutable` | `history.test.ts` | No mutation |
| `recordCompaction: increments count` | `history.test.ts` | Compact tracking |
| `latestEntries: N most recent` | `history.test.ts` | Query |
| `latestEntries: n >= length` | `history.test.ts` | Edge case |
| `entriesSinceLastCompact: no compaction` | `history.test.ts` | No compact |
| `entriesSinceLastCompact: after last compact` | `history.test.ts` | Post-compact window |
| `entriesSinceLastCompact: multiple compacts` | `history.test.ts` | Multi-compact |
| `session isolation: sessionId` | `history.test.ts` | Session scoping |
| `no double-counting: exact one dropped` | `history.test.ts` | Retention correctness |

## Next step (ES-003)

Build a deterministic, explainable advisory engine on top of the history layer:
- Heuristics expressed as pure functions over `MetricsHistory` (testable in isolation).
- Trigger conditions: context fill ≥ threshold, cache_read / total_input ratio, rate-limit proximity.
- Output: labelled recommendations with confidence (high/medium/low) and explanation string.
- Display in the pane's existing "Session" section or a new "Advisor" section.
- No LLM calls, no automatic actions.
