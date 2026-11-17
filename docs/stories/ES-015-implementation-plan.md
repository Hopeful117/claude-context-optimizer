# ES-015 — Implementation Plan

- Story: ES-015
- Date: 2026-11-17
- Status: **Gate 2 — Approved for Implementation**
- Branch: `feat/es-015-evaluation-signal-reliability` (from `feat/es-011-evaluation-results`)

---

## Approved Approach: Option B — Rename + Redefine

Selected over Option A (SDK tool-use detection: infeasible/fragile) and Option C (removes a useful timing signal).

---

## Changes

### 1. `types/index.d.ts`

- Rename `PaneSnapshot.turnsSinceCompaction` → `PaneSnapshot.turnsUntilAnnotation`
- Rename `EvalEntry.turnsToResumption` → `EvalEntry.turnsUntilAnnotation`
- Add `'dismissed'` to `UserAnnotation` = `'positive' | 'negative' | 'skipped' | 'dismissed'`
- Update comments

### 2. `hooks/register.tsx`

- Rename all `turnsSinceCompaction` → `turnsUntilAnnotation`
- Rename all `turnsToResumption` → `turnsUntilAnnotation`
- Bump `evalAtom` shape: `eval-1` → `eval-2`
- Bump `paneAtom` shape: `pane-4` → `pane-5`
- Update dismiss "—" handler to write `userAnnotation: 'dismissed'` to `evalAtom`
- Update pane comment on `eval-2` shape bump

### 3. `docs/architecture/ADR-005-evaluation-data-policy.md`

- Remove `turnsToResumption` from §3 signal table
- Add `turnsUntilAnnotation` with accurate definition
- Remove M1-proxy claim
- Extend `userAnnotation` row to include `dismissed`
- Update Go/No-Go criteria: remove `turnsToResumption` gate
- Add amendment note at top

### 4. `hooks/register.test.ts`

Add regression tests covering:
- Dismiss writes `userAnnotation: 'dismissed'`
- Skip (no action) keeps `userAnnotation: 'skipped'`
- `turnsUntilAnnotation` name and semantics
- Successive compactions: first entry becomes `skipped`, second is annotable
- Session reset clears `turnsUntilAnnotation` to 0 and `pendingAnnotationId` to null
- Subagent turns do not increment `turnsUntilAnnotation`
- `eval-2` shape in atom declaration (documented)

### 5. `docs/roadmap.md`

- Mark ES-015 as In Progress
- Note v1.0.4 target

---

## Shape Migration

| Atom | Old shape | New shape | Reason |
|---|---|---|---|
| `evalAtom` | `eval-1` | `eval-2` | Field renamed + enum extended |
| `paneAtom` | `pane-4` | `pane-5` | Field renamed |

Existing `eval-1` data is wiped. This is correct: those entries stored `turnsToResumption` values that represented annotation timing (not tool-use resumption), so they cannot be retroactively corrected.

---

## No Changes To

- `src/metrics/types.ts` — `HistoryEntry` and `MetricsHistory` are unaffected
- `src/metrics/normalize.ts` — `makeEntry` is unaffected
- `src/advisor/` — no changes
- `src/guide/` — no changes
- `src/pane/` — no changes

---

## Test Execution

```
claude plugin test .
```
