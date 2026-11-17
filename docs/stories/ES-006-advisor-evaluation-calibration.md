# ES-006 — Advisor Evaluation & Calibration

- Status: **Implemented**
- Date: 2026-11-17
- Branch: `feat/es-006-advisor-evaluation-calibration`
- Version: `0.6.0`

## Problem

After ES-004 and ES-005, the advisor engine is functionally correct and robust, but recommendations lack verifiability:

- **No observable evidence**: a recommendation fires but the caller cannot inspect which metric value triggered it, what threshold was crossed, or how many data points were analyzed. This makes debugging and testing hard.
- **Pane readability limit**: the explanation string carries all context in a single sentence. ES-007 needs structured access to individual metric values to build a richer UI without parsing the explanation.
- **Cache efficiency rule — unclear decision value**: `cacheEfficiencyRule` fires as `observation / low` but provides no way to distinguish "3 turns of low ratio" from "20 turns of persistent low ratio". Without a sample count, the user cannot judge relevance.
- **Testing gap**: evaluating rule behavior across the 12 representative scenarios from ES-005 requires either reading source code or parsing explanation strings — neither is reliable.

## Decisions

### 1. Introduce `RecommendationEvidence`

A new type added to `src/advisor/types.ts`:

```typescript
export type RecommendationEvidence = {
  metric: string;        // name of the measured quantity
  observedValue: number; // the value that crossed or compared to the threshold
  threshold?: number;    // the threshold it was compared to, if applicable
  sampleCount?: number;  // number of data points used for this reading
};
```

Each rule populates `evidence` on the `Recommendation` it returns. `evidence` is optional on `Recommendation` to maintain backward compatibility.

**Objectives:**
- Make each recommendation verifiable: the evidence tells you exactly what was measured.
- Expose the metric and threshold for automated testing without parsing strings.
- Surface sample count so the user knows whether a reading is based on 3 turns or 30.
- Prepare structured data for the ES-007 pane.

**Constraints respected:**
- Values come from actually available metrics — no invented data.
- No new metrics collected; evidence is derived directly from what the rule already computed.
- `observation` / `warning` / `action` distinction preserved.

### 2. Each rule produces one evidence entry

| Rule | `metric` | `observedValue` | `threshold` | `sampleCount` |
|---|---|---|---|---|
| `contextFillRule` | `'contextPercent'` | last measured percent | `CONTEXT_FILL_HIGH` or `CONTEXT_FILL_MEDIUM` | `1` (single snapshot) |
| `contextGrowthRule` | `'contextPercentDelta'` | `last.pct − first.pct` | `CONTEXT_GROWTH_RAPID_DELTA` | number of turns in window |
| `cacheEfficiencyRule` | `'cacheReadRatio'` | ratio × 100 (percentage) | `CACHE_EFFICIENCY_LOW_RATIO × 100` | number of turns analyzed |
| `rateLimitRule` | `highest.kind` | `highest.percentUsed` | `RATE_LIMIT_HIGH` or `RATE_LIMIT_MEDIUM` | `1` |

### 3. No threshold changes

The thresholds remain at their ES-004 values. They are labeled as initial hypotheses — not empirically validated — and no new session data is available to justify changing them. Modifying thresholds without data would be arbitrary.

### 4. `cacheEfficiencyRule` retained as observation

A low cache ratio is a legitimate signal in long sessions. The rule is already `observation / low` with a 3-turn minimum. Adding `sampleCount` to its evidence improves transparency without changing behavior. If empirical data later shows this rule never leads to actionable decisions, it can be demoted to a pure display metric in a future story.

### 5. New evaluation test suite

A dedicated `src/advisor/evaluation.test.ts` covers 12 representative scenarios. Tests assert both the presence/absence of recommendations and their evidence fields where applicable. This creates a reproducible regression baseline independent of the explanation string.

## Changes Implemented

### `src/advisor/types.ts`
- Added `RecommendationEvidence` type.
- Added optional `evidence?: readonly RecommendationEvidence[]` to `Recommendation`.

### `src/advisor/rules.ts`
- All four rules now populate `evidence` on the returned recommendation.
- `cacheEfficiencyRule`: `observedValue` is the ratio expressed as a percentage integer (`Math.round(ratio * 100)`); `threshold` is `Math.round(CACHE_EFFICIENCY_LOW_RATIO * 100)`.

### `src/advisor/evaluation.test.ts`
- 12 scenario tests covering normal operation, edge cases, evidence fields, and all-null / missing-data cases.

## Acceptance Criteria

| # | Criterion | Result |
|---|---|---|
| AC-1 | All existing tests continue to pass | ✓ |
| AC-2 | `contextFillRule` evidence.metric = `'contextPercent'`, observedValue = measured pct | ✓ |
| AC-3 | `contextGrowthRule` evidence includes delta and sampleCount | ✓ |
| AC-4 | `cacheEfficiencyRule` evidence includes ratio% and sampleCount | ✓ |
| AC-5 | `rateLimitRule` evidence includes kind and percentUsed | ✓ |
| AC-6 | Scenario 1 (short stable session, 2 turns): no recommendations | ✓ |
| AC-7 | Scenario 3 (rapid growth): `context-growth-rapid` fires, evidence delta ≥ 15 | ✓ |
| AC-8 | Scenario 4 (high fill, stable): fill warning fires, no growth warning | ✓ |
| AC-9 | Scenario 5 (post-compaction): no fill/growth recommendation immediately after | ✓ |
| AC-10 | Scenario 6 (subagents): growth/cache rules ignore subagent turns | ✓ |
| AC-11 | Scenario 11 (missing data): all rules return null gracefully | ✓ |
| AC-12 | No new false positives introduced in any scenario | ✓ |
| AC-13 | No significant performance change — timing module stays identical | ✓ |

## Limits & Open Items

### Evidence does not include timestamps

Evidence shows *what* was measured but not *when*. The `HistoryEntry.timestampMs` values are available in the history but are not included in evidence to keep the type minimal. If a future story needs time-based windowing in evidence, it can be added then.

### Thresholds remain hypotheses

No empirical calibration has been performed. The thresholds (`85 / 70 / 30% / 15 / 90 / 75`) are initial estimates. Validation requires at least 5 real sessions with recorded recommendation outcomes, which requires a live Claude Desktop deployment beyond the current environment.

### Empirical evaluation protocol (open)

To evaluate calibration on live sessions, for each recommendation that fires, record:

| Field | Description |
|---|---|
| `id` | recommendation id |
| `category` | observation / warning |
| `confidence` | high / medium / low |
| `evidence.metric` | which metric triggered it |
| `evidence.observedValue` | the value at trigger time |
| `evidence.threshold` | the threshold crossed |
| `evidence.sampleCount` | how many turns contributed |
| `useful` | did the user take action or find it informative? |
| `falsePositive` | was the recommendation irrelevant? |
| `action` | what the user did (if anything) |
| `outcome` | measurable result (if any) |

This protocol requires no external telemetry — it is a manual journal. No prompts, code, or secrets should be recorded.

The calibration remains open until at least 5 sessions are recorded. Only then should threshold changes be proposed with data justification.

### `cacheEfficiencyRule` long-term relevance

As noted in ES-004, if users cannot improve cache efficiency directly in common workflows, this rule may be better converted to a purely diagnostic display metric. The evidence model makes this easier to evaluate: if `sampleCount` is consistently high (≥ 10 turns) but no user action follows, the signal has low actionability. Revisit after the empirical evaluation above.

## Tests

### Automated (`src/advisor/evaluation.test.ts`)

| Scenario | Description | Expected result |
|---|---|---|
| S-01 | Short stable session (2 turns, 40–50%) | All rules null |
| S-02 | Progressive growth, 5 turns | No growth warning (delta < 15%) |
| S-03 | Rapid growth across 3 turns | `context-growth-rapid`, evidence delta ≥ 15 |
| S-04 | High fill, stable (90% over 5 turns) | `context-fill-high`, no growth warning |
| S-05 | Manual compaction | No fill/growth recommendation immediately after |
| S-06 | Subagent turns mixed with 2 main turns | No growth recommendation (insufficient main turns) |
| S-07 | Low cache ratio, only 2 turns | Null (insufficient sample) |
| S-08 | Low cache ratio, 5+ turns | `cache-efficiency-low` with correct evidence |
| S-09 | High cache ratio, 5+ turns | Null |
| S-10 | Rate limit near saturation (92%) | `rate-limit-high` with evidence |
| S-11 | All-null contextPercent turns | All null |
| S-12 | Fresh history (session reset) | All null |

## Proposed Next Step — ES-007

Design and implement the pane redesign (Context Advisor UX), using the structured `evidence` from ES-006 to present verification-ready recommendation summaries. See `docs/stories/ES-007-context-advisor-ux.md`.
