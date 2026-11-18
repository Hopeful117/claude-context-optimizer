# ES-017 — Evaluation Data Display

- Status: **Gate 1 — Awaiting Human Approval**
- Date: 2026-11-18
- Branch: `feat/es-017-eval-data-display`
- Base: `main` (v1.0.4 — ES-015 merged, `cb33442`)
- Version target: `1.0.5`

---

## Objective

Add a read-only "Evaluation Data" section to the Context Optimizer pane that displays aggregate statistics from `evalAtom`. This eliminates the need to manually track annotation counts during the evaluation period defined in ES-016.

---

## Motivation

ES-016 (`docs/investigations/ES-016-comparative-evaluation-protocol.md`) defines the evaluation procedure for guided vs. unguided compaction. The analysis requires knowing:

- How many entries are in each group (guided / unguided).
- How many are annotated (positive, negative, dismissed, skipped).
- What the response rate and satisfaction rate are per group.

Currently, the only way to obtain this information is to track annotations manually as they occur, since `evalAtom` is not exposed in the pane. The results template (`ES-016-evaluation-results-template.md`) was designed for manual entry.

An in-pane summary eliminates this overhead: the user sees the current aggregate state at any time, without needing to record anything by hand, and without any new privacy surface (all displayed values are integers derived from the existing `evalAtom` fields).

This is "Option B" described in `docs/stories/ES-016-implementation-plan.md` §D5.

---

## Scope

### In scope

1. Read `evalAtom` in the `ui.render` handler.
2. Compute aggregate statistics (counts by group, by annotation value; response rate, satisfaction rate).
3. Exclude `precompute` entries per ADR-005 (amended ES-016).
4. Render a new "Evaluation Data" section at the bottom of the pane, below the annotation widget.
5. Section is hidden when `evalAtom` has zero entries (nothing to show).
6. Pure computation helper extracted to `src/pane/eval-summary.ts` for testability.
7. Unit tests for the computation logic.

### Out of scope

- Raw entry export (CSV, clipboard, file) — deferred, requires a data-flow ADR.
- Verdict rendering (GO/NO-GO) in the pane — the pane shows numbers, not interpretations.
- New atom or new persisted state.
- Modification of evalAtom collection logic.
- Any change to guidance, compaction triggers, or advisor rules.

---

## Constraints

- **ADR-002:** All displayed values are integers or percentages derived from integers. No content displayed.
- **ADR-003:** No LLM calls. Computation is purely arithmetic.
- **ADR-004 / ADR-001:** Fail-open. If `evalAtom` read fails, the section is silently omitted. The rest of the pane renders normally.
- **No new atoms.** The section reads `evalAtom` directly in the render handler.
- **No automatic compaction.** This story adds no new triggers.

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | A new "Evaluation Data" section appears in the pane when `evalAtom` has ≥ 1 entry |
| AC-2 | Section shows total entries, grouped by `wasGuided` (excluding `precompute`) |
| AC-3 | Section shows annotation breakdown (positive / negative / dismissed / skipped) per group |
| AC-4 | Section shows response rate and satisfaction rate per group (with absolute counts) |
| AC-5 | `precompute` entries are excluded from both groups before computing rates |
| AC-6 | Section is absent when `evalAtom` is empty |
| AC-7 | `evalAtom` read failure is silently swallowed; rest of pane renders normally |
| AC-8 | Computation logic lives in `src/pane/eval-summary.ts` and is fully unit-tested |
| AC-9 | TypeScript compiles without error |
| AC-10 | All tests pass (`claude plugin test .`) |

---

## Workflow Documents

- **Repository Analysis**: `docs/stories/ES-017-repository-analysis.md` ✅
- **Implementation Plan**: `docs/stories/ES-017-implementation-plan.md` (pending Gate 1 approval)
- **Implementation Report**: `docs/stories/ES-017-implementation-report.md` (pending Gate 2 approval)
- **Engineering Report**: `docs/stories/ES-017-engineering-report.md` (pending)
