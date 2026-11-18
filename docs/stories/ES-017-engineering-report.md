# ES-017 — Engineering Report

- Story: `docs/stories/ES-017-eval-data-display.md`
- Date: 2026-11-18
- Branch: `feat/es-017-eval-data-display`
- Version: v1.0.5
- Status: **Complete**

---

## Summary

ES-017 adds a read-only "Evaluation Data" section to the Context Optimizer pane. The section displays aggregate statistics from `evalAtom` — counts per group, response rate, and satisfaction rate — eliminating the need to track annotations manually during the ES-016 evaluation period.

No new atoms, no schema changes, no new event handlers. The only runtime change is a fail-open read of `evalAtom` in the existing `ui.render` handler.

---

## What Changed

### New: `src/pane/eval-summary.ts`

Pure function `computeEvalSummary(log: EvalLog): EvalSummary`. Stateless, no side effects, no async. Excludes `precompute` entries (ADR-004 constraint), splits by `wasGuided`, computes `responseRate` and `satisfactionRate` with null-safe division.

### New: `src/pane/eval-summary.test.ts`

15 unit tests. All pass. One test adjusted during development: `toBeCloseTo` is not available in the Claude Code SDK test runner — replaced with explicit tolerance (`Math.abs(x - y) < 0.001`).

### Modified: `hooks/register.tsx`

- Import added (1 line).
- `ui.render`: `evalLog` read with `.catch()` fallback + `computeEvalSummary` call (3 lines).
- New JSX section: 50 lines. Conditional on `evalSummary.totalEntries > 0`.

---

## Pane Section

Displayed when `evalAtom` has at least one entry (hidden when empty):

```
Evaluation Data  (14 entries, 2 precompute excl.)
  Unguided (A)   total:8  annotated:5  skipped:3
    response: 5/8=63%   satisfaction: 3/5=60%
    pos:3  neg:2  dis:0
  Guided (B)     total:4  annotated:3  skipped:1
    response: 3/4=75%   satisfaction: 3/3=100%
    pos:3  neg:0  dis:0
```

Format `N/D=P%` satisfies ADR-005 amended ES-016 requirement (absolute counts alongside percentages).

---

## Test Results

| Metric | Value |
|---|---|
| Tests | 194 pass / 0 fail |
| Files | 11 |
| New tests | 15 (eval-summary.test.ts) |
| Previous baseline | 180 |
| TypeScript errors | 0 |

---

## Modified Files

| File | Type | Change |
|---|---|---|
| `src/pane/eval-summary.ts` | New | `computeEvalSummary` + types |
| `src/pane/eval-summary.test.ts` | New | 15 unit tests |
| `hooks/register.tsx` | Modified | import + evalAtom read + JSX section |
| `.claude-plugin/plugin.json` | Modified | Version 1.0.3 → 1.0.5 |
| `AGENTS.md` | Modified | Version updated; Current Work updated |
| `docs/roadmap.md` | Modified | ES-016/017 entries |
| `docs/stories/ES-017-*.md` | New (5) | Story artifacts |

---

## ADR Compliance

| ADR | Status |
|---|---|
| ADR-001 — fail-open | ✅ `.catch()` on `evalAtom` read; section absent on failure |
| ADR-002 — no conversation content | ✅ Displays only integers derived from `EvalEntry` |
| ADR-003 — no LLM calls | ✅ Pure arithmetic |
| ADR-004 — no automatic compaction | ✅ No new triggers |
| ADR-005 amended ES-016 — counts + percentages | ✅ `N/D=P%` format |

---

## Manual Runtime Validation

| ID | Behavior |
|---|---|
| MRV-ES017-1 | "Evaluation Data" section absent on first load (empty evalAtom) |
| MRV-ES017-2 | Section appears after first compaction with correct group assignment |
| MRV-ES017-3 | Rates update correctly after annotation (👍/👎/—) |
| MRV-ES017-4 | precompute entries excluded from displayed totals |
| MRV-ES017-5 | evalAtom read failure (simulated) leaves rest of pane unaffected |

---

## Next Steps

1. Create PR.
2. Merge ES-016 PR (#24) first (for consistency), then merge this PR.
3. Complete MRV items (ES-014/ES-015 backlog + ES-017 new items) in Claude Desktop.
4. Begin evaluation data collection per `docs/investigations/ES-016-comparative-evaluation-protocol.md`.
