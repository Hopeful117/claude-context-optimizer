# ES-017 — Implementation Report

- Story: `docs/stories/ES-017-eval-data-display.md`
- Date: 2026-11-18
- Branch: `feat/es-017-eval-data-display`
- Status: **Complete — Pending Review**

---

## Changes Implemented

### `src/pane/eval-summary.ts` (new)

- `computeEvalSummary(log: EvalLog): EvalSummary` — pure function.
- `EvalSummary`: `{ totalEntries, precomputeExcluded, groupA, groupB }`.
- `GroupStats`: `{ total, positive, negative, dismissed, skipped, annotated, responseRate, satisfactionRate }`.
- `precompute` entries filtered out before splitting into groups.
- `responseRate` and `satisfactionRate` are `null` when denominator is 0 (no division by zero).

### `src/pane/eval-summary.test.ts` (new)

15 unit tests covering:
- Empty log (all zeros, rates null).
- All-precompute log (both groups empty).
- Group assignment by `wasGuided`.
- All four annotation values counted correctly.
- `skipped` excluded from `annotated`.
- `responseRate` and `satisfactionRate` formulas.
- `dismissed` not counted as negative.
- Null rates when denominator is 0.
- Precompute exclusion (`totalEntries` unchanged, groups reduced).
- Mixed groups computed independently.
- 200-entry cap (no error).

### `hooks/register.tsx` (modified)

1. Import added: `computeEvalSummary` from `../src/pane/eval-summary`.
2. `ui.render` handler: `evalLog` read with `.catch()` fallback (fail-open); `evalSummary` computed.
3. New "Evaluation Data" JSX section between annotation widget and Overhead.

---

## Test Results

```
194 pass, 0 fail
Ran 194 tests across 11 files. [0.58s]
```

Previous baseline: 180 pass. New tests: 15 (all in `src/pane/eval-summary.test.ts`). One test corrected during development (`toBeCloseTo` not available in SDK — replaced with explicit tolerance check).

---

## ADR Compliance

| ADR | Status |
|---|---|
| ADR-001 — fail-open | ✅ `evalAtom` read wrapped in `.catch()` — empty log on failure |
| ADR-002 — no conversation content | ✅ Displays only integers derived from `EvalEntry` fields |
| ADR-003 — no LLM calls | ✅ Pure arithmetic |
| ADR-004 — no automatic compaction | ✅ No new triggers |
| ADR-005 amended ES-016 — absolute counts + percentages | ✅ Format `N/D=P%` |
