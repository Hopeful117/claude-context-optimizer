# ES-015 — Implementation Report

- Story: ES-015
- Date: 2026-11-17
- Branch: `feat/es-015-evaluation-signal-reliability`
- Status: **Complete — Pending Review**

---

## Changes Implemented

### `types/index.d.ts`

- `EvalEntry.turnsToResumption: number | null` → `EvalEntry.turnsUntilAnnotation: number | null`
- `PaneSnapshot.turnsSinceCompaction: number` → `PaneSnapshot.turnsUntilAnnotation: number`
- `UserAnnotation` = `'positive' | 'negative' | 'skipped' | 'dismissed'` (added `'dismissed'`)
- Updated JSDoc comments on both renamed fields

### `hooks/register.tsx`

- `paneAtom` shape bumped `pane-4` → `pane-5`; initial value updated
- `evalAtom` shape bumped `eval-1` → `eval-2`; comment updated with semantics
- All occurrences of `turnsSinceCompaction` renamed to `turnsUntilAnnotation` (5 sites: initial value, session.start reset, turn.complete counter, session.end reset, session.compact reset)
- All occurrences of `turnsToResumption` renamed to `turnsUntilAnnotation` (2 sites: evalEntry creation, 👍/👎 annotation handlers)
- Dismiss handler (—): now writes `userAnnotation: 'dismissed'` to `evalAtom` before clearing `pendingAnnotationId`
- Handler comments updated

### `docs/architecture/ADR-005-evaluation-data-policy.md`

- Status updated: "Accepted (amended 2026-11-17 by ES-015)"
- §3: `evalAtom` shape updated to `eval-2`
- §3: `turnsToResumption` → `turnsUntilAnnotation` with accurate definition
- §3: `userAnnotation` table expanded with all four values and their meanings
- §5: M1 proxy claim removed; `turnsUntilAnnotation` noted as supplementary context only
- §5: Go/No-Go criteria revised — `turnsToResumption` gate removed; annotation positive rate is primary criterion; `skipped` excluded from rate calculation
- §6: Privacy note updated (`turnsUntilAnnotation`, four-state enum)
- §7: evalAtom shape reference updated
- Consequences updated
- Amendment section appended explaining the ES-015 correction

### `hooks/register.test.ts`

- Updated 6 existing ES-014 tests to use `turnsUntilAnnotation` / `dismissed`
- Added 7 new ES-015 regression tests:
  - `annotation: dismiss (—) writes dismissed to evalAtom`
  - `annotation: skipped means annotation never reached`
  - `successive compactions: first entry stays skipped`
  - `successive compactions: compactionId uniqueness`
  - `session reset: turnsUntilAnnotation and pendingAnnotationId reset`
  - `dismissed vs skipped: distinguishable after ES-015`
  - `annotation rate: only positive+negative+dismissed count toward sample`
  - `turnsUntilAnnotation: annotation at turn 0`

---

## Test Results

```
180 pass, 0 fail
Ran 180 tests across 10 files. [0.52s]
```

All pre-existing tests continue to pass. 7 new regression tests added and passing.

---

## Shape Migration

| Atom | Old | New | Existing data |
|---|---|---|---|
| `evalAtom` | `eval-1` | `eval-2` | Wiped (mislabeled `turnsToResumption`) |
| `paneAtom` | `pane-4` | `pane-5` | Wiped (renamed `turnsSinceCompaction`) |

---

## Deviations from Implementation Plan

None.

---

## Runtime Validation Required

The following behaviors require manual validation in Claude Desktop (cannot be tested without full SDK context):

| ID | Scenario |
|---|---|
| MRV-ES015-1 | Dismiss "—" press: evalAtom entry updated with `userAnnotation: 'dismissed'`; `pendingAnnotationId` cleared |
| MRV-ES015-2 | 👍/👎 press: evalAtom entry updated with `turnsUntilAnnotation` = number of turns since compaction |
| MRV-ES015-3 | Session start/end (/clear): `turnsUntilAnnotation` resets to 0, `pendingAnnotationId` to null |
| MRV-ES015-4 | Successive compactions: first entry remains `skipped`; second annotation works correctly |
| MRV-ES015-5 | Atom write failure on dismiss: fail-open — pane continues rendering |
