# ES-017 — Implementation Plan

- Story: `docs/stories/ES-017-eval-data-display.md`
- Date: 2026-11-18
- Status: **Gate 2 — Approved**

---

## Overview

Three files modified / created:

| File | Change |
|---|---|
| `src/pane/eval-summary.ts` | New — `computeEvalSummary` pure function |
| `src/pane/eval-summary.test.ts` | New — 15 unit tests |
| `hooks/register.tsx` | Modify — import, `evalAtom` read, JSX section |

---

## D1 — `src/pane/eval-summary.ts`

Pure function `computeEvalSummary(log: EvalLog): EvalSummary`.

Steps:
1. Filter out `precompute` entries.
2. Split into Group A (`wasGuided=false`) / Group B (`wasGuided=true`).
3. Count positive / negative / dismissed / skipped per group.
4. Compute `annotated = positive + negative + dismissed`.
5. Compute `responseRate = annotated / total` (null if total = 0).
6. Compute `satisfactionRate = positive / annotated` (null if annotated = 0).

Exported types: `GroupStats`, `EvalSummary`.

---

## D2 — `hooks/register.tsx` changes

**Import:** `computeEvalSummary` from `../src/pane/eval-summary`.

**In `ui.render`:** Add fail-open read after existing reads:
```ts
const evalLog = await read($, evalAtom).catch(() => ({ entries: [], maxEntries: 200 }));
const evalSummary = computeEvalSummary(evalLog);
```

**New JSX section:** "Evaluation Data", placed after the annotation widget, before Overhead. Hidden when `evalSummary.totalEntries === 0`. Shows per-group counts and rates in the format `N/D=P%`.

---

## D3 — Pane section format

```
Evaluation Data  (14 entries, 2 precompute excl.)
  Unguided (A)   total:8  annotated:5  skipped:3
    response: 5/8=63%   satisfaction: 3/5=60%
    pos:3  neg:2  dis:0
  Guided (B)     total:4  annotated:3  skipped:1
    response: 3/4=75%   satisfaction: 3/3=100%
    pos:3  neg:0  dis:0
```

Rates shown as `N/D=P%` (absolute counts + percentage) per ADR-005 amended ES-016 requirement.
