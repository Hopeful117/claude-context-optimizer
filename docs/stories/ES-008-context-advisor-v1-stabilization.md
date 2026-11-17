# ES-008 — Context Advisor V1 Stabilization

- Status: **Implemented**
- Date: 2026-11-17
- Branch: `feat/es-008-context-advisor-v1-stabilization`
- Base: `feat/es-007-context-advisor-ux` (v0.7.0 — ES-007 not yet merged to main)
- Version: `0.8.0`

## Objective

Stabilize the Context Advisor V1 before beginning effectiveness evaluation (ES-009). No new product features. Correct confirmed behavioral inconsistencies and reliability issues that could mislead users or disrupt the Claude Code pipeline.

---

## Anomalies Identified

### ANO-001 — Stale context display after compaction

**Impact**: After a `session.compact` event, the pane continues to show the pre-compaction context fill percentage and API usage as if they were current measurements. This directly contradicts the pane's information hierarchy (ES-007 AC-5: "Trend shows N/A when fewer than 3 main turns are available") and misleads the user about their actual context state.

**Technical cause**: The `session.compact` handler in `hooks/register.tsx` increments `compactionCount` and sets `lastCompactTrigger`, but does not reset `paneAtom.context.percent`, `paneAtom.context.tokens`, or `paneAtom.apiUsage`. The history layer correctly records a compact entry with null tokens/percent; the advisory rules correctly use `entriesSinceLastCompact`; but the pane's display atom is never updated to reflect the new (empty) context window.

**Retained fields after compaction**: `context.window` (model unchanged), `costUsd` (cumulative), `rateLimits` (still valid from API), `turns`, `measurements`, `compactionCount`, `sessionId`, `model`.

**Cleared fields after compaction**: `context.tokens`, `context.percent` (obsolete), `apiUsage` (pre-compaction turn data, no longer meaningful).

**Correction**: In the `session.compact` handler, update `paneAtom` to null `context.tokens`, `context.percent`, and `apiUsage`.

---

### ANO-002 — evidenceLine() assumes all metrics are percentages

**Impact**: The `evidenceLine()` helper in `hooks/register.tsx` unconditionally appends `%` to `ev.observedValue`. For `contextPercentDelta` evidence (produced by `contextGrowthRule`), this presents a growth delta (e.g., 17 percentage points) as `17%`, which could be confused with an absolute fill level. The metric name contains "Delta" so a careful reader can infer it, but the display is imprecise.

**Technical cause**: `evidenceLine` has no information about the unit of `observedValue`. It treats the `metric` name as opaque documentation but formats all values identically.

**Correction**: Add an optional `valueUnit?: '%' | 'pp'` field to `RecommendationEvidence`. Default (absent/`%`) preserves existing behavior. `'pp'` (percentage points) renders as `+17 pp` for deltas. Update `contextGrowthRule` to set `valueUnit: 'pp'` on its evidence. Update `evidenceLine` to use this field.

**No metric-name string matching**: the formatting is driven by an explicit typed field, not by inspecting the metric name.

---

### ANO-003 — `turns` counter includes subagent turns

**Impact**: The `turns` field in `paneAtom` (shown in the pane as "turns: N") is incremented on every `turn.complete` event, including subagent events. A user running a session with multiple subagents will see a turn count that includes subagent invocations, which don't correspond to their own interactions. The pane label gives no indication of this.

**Technical cause**: The `turn.complete` handler increments `turns` unconditionally before checking `isSubagent`.

**Decision**: The `turns` counter represents main-session turns only (consistent with how all advisory rules count turns). Subagent activity is captured in the history (for future analysis) but not reflected in the pane's session counter.

**Correction**: Only increment `paneAtom.turns` when `!isSubagent` in the `turn.complete` handler.

---

### ANO-004 — `$.ui.status()` in catch block can block `next(event)`

**Impact**: In the `session.start`, `session.measure`, and `turn.complete` handlers, `next(event)` is called after the try/catch/finally block. If `$.ui.status('ctx:err')` throws inside the catch block, the exception propagates out and prevents `next(event)` from being called. This would stall the Claude Code pipeline on an observability failure — a Mod error blocking the user's session.

**Technical cause**: The pattern `catch { $.ui.status('ctx:err'); }` does not protect against SDK failures in the status call itself. The `session.compact` and `session.end` handlers are not affected because they call `next(event)` before their try/catch blocks.

**Correction**: Wrap `$.ui.status('ctx:err')` in its own `try/catch` within the outer catch block:
```ts
catch {
  try { $.ui.status('ctx:err'); } catch { /* ignore observability-only failure */ }
}
```
This guarantees `next(event)` is reached even when the status call fails.

---

## Corrections Retained

| ID | File(s) | Change |
|---|---|---|
| ANO-001 | `hooks/register.tsx` | Null `context.tokens`, `context.percent`, `apiUsage` in paneAtom on compact |
| ANO-002 | `src/advisor/types.ts`, `src/advisor/rules.ts`, `hooks/register.tsx` | Add `valueUnit` to `RecommendationEvidence`; update `contextGrowthRule` and `evidenceLine` |
| ANO-003 | `hooks/register.tsx` | Only increment `turns` for main-session turns (`!isSubagent`) |
| ANO-004 | `hooks/register.tsx` | Protect `$.ui.status('ctx:err')` calls in catch blocks |

---

## Acceptance Criteria

| # | Criterion | Automated |
|---|---|---|
| AC-1 | After compaction: `paneAtom.context.percent` and `.tokens` are null | Test (unit) |
| AC-2 | After compaction: `paneAtom.apiUsage` is null | Test (unit) |
| AC-3 | After compaction: `paneAtom.context.window` is preserved | Test (unit) |
| AC-4 | After compaction: trend returns `N/A` (no new post-compact turns) | Test (unit — existing) |
| AC-5 | After compaction: advisory rules return no fill/growth recommendations | Test (unit — existing) |
| AC-6 | `evidenceLine` for `contextPercentDelta` with `valueUnit: 'pp'` renders as `+17 pp` | Test (unit) |
| AC-7 | `evidenceLine` for `contextPercent` without `valueUnit` renders as `85%` | Test (unit) |
| AC-8 | `turns` counter excludes subagent events | Test (unit) |
| AC-9 | `turns` counter counts main-session events correctly | Test (unit) |
| AC-10 | `next(event)` is called even when `$.ui.status()` throws in catch block | Test (unit — timing module coverage; full pipeline: manual) |
| AC-11 | All existing unit tests pass unchanged | Test suite |
| AC-12 | TypeScript compilation has no new errors | `tsc --noEmit` |

---

## Tests Added

- `hooks/register.test.ts` — new file: hook behavior tests for ANO-001, ANO-003, ANO-004
- `src/advisor/rules.test.ts` — additional cases: post-compact advisory state, `valueUnit` on evidence
- `src/advisor/evaluation.test.ts` — additional case: `cacheEfficiencyRule` and `contextFillRule` post-compaction

---

## Remaining Limitations

- **ANO-004**: The protection against a throwing `$.ui.status()` is structural, but we have no automated test that simulates the SDK call throwing. Full pipeline resilience can only be validated in a live session (manual protocol).
- **Hook lifecycle tests**: The `ui.render` handler and full hook chain cannot be unit-tested without a mock Claude Code runtime. Manual validation remains required for render-path correctness.
- **Rate limit display**: `evidenceLine` shows `requests: 92%` for a rate limit metric — the metric name is the rate limit kind (e.g. "requests"), not a semantic label. This is accurate but potentially confusing; deferred to ES-009 or a later UX pass.
- **Multiple compactions**: the stale-display fix is correct for each compaction event individually. If `session.compact` fires without a following `turn.complete` or `session.measure`, the pane will correctly show null fill until the next measurement arrives.

---

## Go/No-Go for ES-009

**Recommendation: Go**, with the following conditions met:
- All acceptance criteria AC-1 through AC-12 pass.
- Manual validation confirms no regression on the 8 scenarios from ES-007.
- The PR is reviewed and merged.

The V1 is structurally sound: bounded history, deterministic rules, correct post-compaction windowing, negligible overhead. The four anomalies corrected here were presentation and reliability issues, not fundamental design flaws. ES-009 (effectiveness evaluation) can proceed once this stabilization is merged.
