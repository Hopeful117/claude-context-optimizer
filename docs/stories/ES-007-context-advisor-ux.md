# ES-007 — Context Advisor UX

- Status: **Design — awaiting ES-006 validation**
- Date: 2026-11-17
- Branch: to be created after ES-006 merges
- Version: `0.7.0` (target)

## Prerequisite

ES-007 builds on the `evidence` model stabilized in ES-006. Do not start implementation until ES-006 is merged and its `RecommendationEvidence` interface is available on the main branch.

## Problem

The current pane renders all sections at equal visual weight. The user must scan from top to bottom to find the relevant information:

- The Advisor section is first but its one-line format makes it hard to quickly assess severity.
- Context fill and trend are in the middle, buried under the advisor output.
- Diagnostics (cache, rate limits, cost, session details, overhead) occupy the same visual space as actionable content.
- Recommendations carry no visible evidence — the user cannot verify what triggered a warning.
- A "no recommendations" state reads as a guarantee of optimality, which it is not.

## Objectives

1. The user can identify session health (fill, trend, recommendations) in a single glance.
2. Recommendations are distinguishable by severity without relying on color alone.
3. Evidence is surfaced clearly enough to be useful but concisely enough not to dominate.
4. Diagnostic details remain accessible but do not compete with actionable content.
5. The pane remains a native Claude Code Mod — no external frontend, no DOM manipulation.

## Proposed Information Hierarchy

### Level 1 — Session Overview (always visible, top of pane)

| Element | Content | Source |
|---|---|---|
| Context fill | `XX%` with token counts | `snap.context.percent` |
| Fill trend | Growth delta across last N main turns, or `—` if insufficient | `contextGrowthRule` evidence |
| Advisor state | `✓ No recommendations` / `1 observation` / `2 warnings` summary | `advisory.recommendations.length` |

The overview section conveys health at a glance. Absent values are displayed as `N/A` with a dimmed style, never omitted.

**Fill trend display options** (ranked by SDK support, to be validated):
- Textual: `↑ +12% (3 turns)` / `→ stable` / `N/A`
- If `contextPercentDelta` evidence is available from `contextGrowthRule`, use its `observedValue` and `sampleCount`.
- Do not display trend if fewer than `CONTEXT_GROWTH_MIN_TURNS` main turns are available in the current window.

### Level 2 — Advisor Insights

One block per recommendation, ordered by confidence (high → medium → low).

Each recommendation block shows:
1. **Severity marker**: `⚠` warning, `ℹ` observation, `→` action — text-only, no color dependency.
2. **Label**: short title (existing `r.label`).
3. **Explanation**: one sentence (existing `r.explanation`).
4. **Evidence line**: compact metric summary from `r.evidence[0]` — e.g. `context: 90% (threshold: 85%)` or `cacheReadRatio: 1% over 5 turns`.
5. **Confidence tag**: `[H]` / `[M]` / `[L]` — only shown when it adds information (i.e. `medium` or `low`).

If no recommendations: `ℹ No active recommendations — thresholds not reached.` (not "all good"; avoids implying guaranteed optimality).

### Level 3 — Diagnostics (collapsed or below)

The technical details section retains all existing metrics but moves below the actionable content:

- Cache usage (last turn breakdown)
- Rate limits with reset times
- Cost (cumulative)
- Session ID, model, turn/measure counts, compaction count
- History entry count
- Overhead p50/p95 when available

Whether this section can be collapsed depends on the SDK's `Box` / `Text` capabilities. If collapsing is unsupported, it remains visible but visually subordinate (dimColor or separator line).

## SDK Capability Audit Required

Before implementing, verify the following against the installed `claude-code` SDK:

| Capability | Current usage | ES-007 need | Verified? |
|---|---|---|---|
| `Box flexDirection="column"` | ✓ used | Nesting structure | ✓ (from existing pane) |
| `Text dimColor` | ✓ used | Muted text | ✓ |
| `Text bold` | ✓ used | Section headers | ✓ |
| Conditional rendering | ✓ used (`&&`) | Show/hide sections | ✓ |
| `gap` on `Box` | ✓ used | Section spacing | ✓ |
| `Box` collapse / accordion | ✗ not used | Optional | ⬜ unverified |
| Inline color / background | ✗ not used | Optional severity color | ⬜ unverified |
| Progress bar / meter | ✗ not used | Fill indicator | ⬜ unverified |
| Dynamic text width | ✗ not used | Trend arrow display | ⬜ unverified |

If a capability cannot be verified, its design must fall back to a text-only equivalent.

## Fill Trend Implementation

The fill trend is derived from `contextGrowthRule`'s evidence when it fires, or computed directly from the history when it does not.

**Algorithm (pure, no new engine calls):**
```
entries = entriesSinceLastCompact(history)
mainTurns = entries.filter(kind='turn' && contextPercent != null && !isSubagent)
              .slice(-CONTEXT_GROWTH_MIN_TURNS)
if mainTurns.length < CONTEXT_GROWTH_MIN_TURNS:
  → display "trend: N/A (insufficient data)"
else:
  delta = mainTurns.last.contextPercent - mainTurns.first.contextPercent
  → display `↑ +{delta}%` or `↓ {delta}%` or `→ stable (±{|delta|}%)`
```

This is a pure function. It reuses existing `entriesSinceLastCompact` and the same filter as `contextGrowthRule`. No new state, no new atom.

## Evidence Display

Evidence is displayed as a compact supplementary line under each recommendation explanation:

```
⚠ [H] Context nearly full: Context is at 90% — the window is filling up. …
     context fill: 90%  ·  threshold: 85%
```

```
ℹ [L] Low cache read ratio: 1% of recent input tokens …
     cacheReadRatio: 1%  ·  threshold: 30%  ·  5 turns
```

If `evidence` is absent or empty, the evidence line is not shown.

## Performance Constraints

- The pane render handler already calls `evaluate()` and `getAllStats()`.
- ES-007 must not add new I/O operations or atom reads beyond what already happens.
- The trend calculation (`entriesSinceLastCompact` + filter) is O(n) over the bounded history (≤ 100 entries). This is acceptable.
- The overhead target from ES-005 (`ui.render` p50 < 20 ms, p95 < 50 ms) must not regress.

## Test Plan

### Automated

Verify that all existing `rules.test.ts` and `evaluation.test.ts` tests continue to pass.

Add render-level tests for the pane output if the SDK's testing utilities support it. If not, verify via code review that:
- Evidence lines are rendered only when `r.evidence` is non-empty.
- Trend line shows `N/A` when fewer than `CONTEXT_GROWTH_MIN_TURNS` main turns are available.
- "No recommendations" state does not use the phrase "all good".

### Manual (Claude Desktop)

| Scenario | Expected pane behavior |
|---|---|
| Fresh session, 1 turn | Overview: fill%, trend N/A, no recommendations |
| 3+ turns, stable | Trend shows delta, no warnings |
| Rapid growth, 3 turns | Growth warning with evidence line |
| High fill | Fill warning, evidence shows threshold |
| Post-compaction | Trend N/A, fill N/A, no spurious warnings |
| Rate limit high | Warning with rate limit kind and % |
| Low cache, 5 turns | Observation with evidence line |
| Multiple recommendations | Ordered high → medium → low, all with evidence |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | Session overview (fill, trend, advisor state) appears at top |
| AC-2 | Recommendations show severity marker, label, explanation, evidence line |
| AC-3 | Evidence line is omitted when evidence is absent |
| AC-4 | "No recommendations" state does not imply guaranteed optimality |
| AC-5 | Trend shows `N/A` when fewer than 3 main turns are available |
| AC-6 | Diagnostics remain accessible (not hidden) |
| AC-7 | Pane renders without crash on any existing test scenario |
| AC-8 | `ui.render` overhead does not regress from v0.6.0 baseline |
| AC-9 | No external frontend, no DOM manipulation, no additional API calls |

## Open Questions

1. **Collapsible sections**: are they supported by the SDK? If not, the Level 3 section stays expanded but visually subordinate.
2. **Progress bar for context fill**: the SDK may expose a styled numeric display — verify before designing a custom visual.
3. **Trend direction symbols** (`↑` / `↓` / `→`): render correctly in the Code tab terminal font? Verify on target platform.
4. **Evidence line format**: single-line compact vs. indented multi-part? Depends on typical terminal width in the Code tab.

## Delivery

1. Create branch `feat/es-007-context-advisor-ux` from the commit that merged ES-006.
2. Audit SDK capabilities (see table above) in `hooks/register.tsx` before writing new render code.
3. Implement pane redesign incrementally: overview → advisor section → evidence → diagnostics.
4. Run full test suite, verify performance targets.
5. Manual validation in Claude Desktop (8 scenarios above).
6. Update plugin.json to `0.7.0`.
7. Create pull request. Do not merge automatically.
