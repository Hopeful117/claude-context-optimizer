# ES-013 — Implementation Report

- Story: `docs/stories/ES-013-guided-compaction-stabilization.md`
- Plan: `docs/stories/ES-013-implementation-plan.md` ✅ Approved 2026-11-17
- Date: 2026-11-17
- Version: v1.0.2

---

## What Was Built

### ANO-001 — `src/metrics/normalize.ts`

Added `wasGuided?: boolean` to `MakeEntryParams` and propagated it in `makeEntry`:
- `MakeEntryParams` gains `wasGuided?: boolean` (optional — no impact on existing callers).
- `makeEntry` returns `wasGuided: params.wasGuided` in the `HistoryEntry`.

### ANO-001 — `hooks/register.tsx` (`session.compact`)

Fixed the `wasGuided` temporal dead zone in the post-compaction state update:

**Before:**
```typescript
const entry = makeEntry({ ..., wasGuided });   // ← TDZ: ReferenceError
...
const wasGuided = shouldGuide;                 // ← declared after use
```

**After:**
```typescript
// Before the try block:
const wasGuided = eventToPass !== event;       // ← declared before use, in scope
...
const entry = makeEntry({ ..., wasGuided });   // ← safe
```

`wasGuided = eventToPass !== event` is semantically correct: it is `true` only when `composeInstructions()` succeeded and produced a new event object. If `shouldGuide` was `true` but composition threw (fail-open path), `eventToPass === event` and `wasGuided` is correctly `false`. This eliminates the false positive from the previous `wasGuided = shouldGuide` logic.

### ANO-002 — `hooks/register.tsx` (`paneAtom` initial state)

Added `rememberPrefs: false` to the `paneAtom` initial value.

The `satisfies PaneSnapshot` check now passes because `PaneSnapshot.rememberPrefs: boolean` is satisfied. No shape bump required — `rememberPrefs: false` is the correct default and matches the value already written by every `update()` call.

### ANO-003 — `types/index.d.ts`

Added `prefs: Shaped<{ rememberPrefs: boolean; guideEnabled: boolean }>` to the `PluginState` module augmentation. The `'context-optimizer'` plugin state contract now covers all four atoms in use: `history`, `pane`, `metrics` (migration shim), and `prefs`.

### ANO-004 — `src/guide/instructions.test.ts`

Raised the threshold from `< 600` to `< 700`. The template is 640 characters. All 7 ADR-004 preservation categories are present. The threshold is a guard against unintended growth, not a compression requirement. Comment added to document the rationale.

### ANO-005 — `hooks/register.tsx` (`session.compact` and `session.end`)

Wrapped the `$.ui.status('ctx:err')` calls in secondary `try/catch`, matching the pattern already used in `session.start`, `session.measure`, and `turn.complete`:

```typescript
} catch {
  try { $.ui.status('ctx:err'); } catch { /* ignore observability-only failure */ }
}
```

This prevents a secondary exception from `$.ui.status()` propagating out of the catch block.

### ANO-006 — `hooks/register.tsx` (`session.start` and `session.end`)

Guarded both `read($, prefsAtom)` calls with a `.catch()` fallback:

```typescript
const prefs = await read($, prefsAtom).catch(() => ({ rememberPrefs: false, guideEnabled: false }));
```

If the atom read fails (store unavailable, corrupted state), the session initializes with safe defaults (`rememberPrefs: false, guideEnabled: false`) rather than propagating the error to the outer catch block. Without this guard, a read failure would leave `paneAtom` in its previous stale state.

### New test file — `hooks/register.test.ts`

Added regression tests covering:
- `makeEntry` propagates `wasGuided: true`, `false`, and `undefined` correctly.
- `wasGuided = eventToPass !== event` semantics: guidance off → `false`; composition succeeds → `true`; composition throws → `false` (fail-open).
- Trigger policy (`computeShouldGuide`): all 7 trigger/flag combinations.
- `prefsAtom` and `paneAtom` default shapes (ANO-002/ANO-006 contract verification).
- `toggleGuide` and `toggleRemember` pure logic.
- Manual runtime validation requirements documented as `MRV-001` through `MRV-005` (require live Claude Desktop session).

### Documentation

| File | Change |
|---|---|
| `AGENTS.md` | Version v0.9.1 → v1.0.2; test command corrected to `claude plugin test .`; Current Work updated |
| `docs/roadmap.md` | ES-012 and ES-013 entries added; ES-011 evaluation status clarified as pending |
| `.claude-plugin/plugin.json` | Version 1.0.1 → 1.0.2 |

---

## Acceptance Criteria Verification

| # | Criterion | Status |
|---|---|---|
| AC-1 | ANO-001: no TDZ; `wasGuided` reflects actual injection | ✅ `wasGuided = eventToPass !== event` before try block |
| AC-2 | ANO-002: `paneAtom` initial state has `rememberPrefs: false`; `satisfies PaneSnapshot` passes | ✅ |
| AC-3 | ANO-003: `PluginState` has `prefs` key | ✅ |
| AC-4 | ANO-004: threshold raised to 700; template unchanged; all 7 categories present | ✅ |
| AC-5 | ANO-005: secondary try/catch in `session.compact` and `session.end` | ✅ |
| AC-6 | ANO-006: `prefsAtom` read guarded with safe default fallback | ✅ |
| AC-7 | TypeScript compiles without error | ✅ Verified by inspection: `satisfies PaneSnapshot` now complete; `PluginState` now has `prefs` |
| AC-8 | All tests pass (0 known failures) | ✅ 161/161 pass — `claude plugin test .` |
| AC-9 | No new features, no behavior changes beyond bug fixes | ✅ |
| AC-10 | Documentation reflects implemented state | ✅ |

---

## Quality Validation

**Command:** `/home/ludo/.config/Claude/claude-code/2.1.325/00b1b977bcc3/claude plugin test .`

| Metric | Result |
|---|---|
| Total tests | **161** (142 existing + 19 new) |
| Pass | **161** |
| Fail | **0** |
| Files | 10 (9 existing + `hooks/register.test.ts`) |
| Duration | 0.63s |

| Check | Result |
|---|---|
| TypeScript — `satisfies PaneSnapshot` (ANO-002) | ✅ Compiles (implicit in plugin test runner) |
| `PRESERVATION_TEMPLATE: within reasonable length` (ANO-004) | ✅ Pass (640 < 700) |
| `makeEntry: wasGuided propagated` (new, ANO-001) | ✅ 4 tests pass |
| `wasGuided semantics: eventToPass !== event` (new, ANO-001) | ✅ 4 tests pass |
| `trigger policy` (new, ADR-004) | ✅ 7 tests pass |
| `prefsAtom / paneAtom defaults` (new, ANO-002/006) | ✅ 4 tests pass |
| All 142 existing tests | ✅ Pass unchanged |

**Manual runtime validation remaining** (require live Claude Desktop session — SDK-bound handler behaviors):
- MRV-001: exactly one `next()` call per compact invocation
- MRV-002: `$.ui.status()` failure in catch does not propagate (ANO-005)
- MRV-003: `prefsAtom` read failure → safe default fallback (ANO-006)
- MRV-004: `$.ui.status()` failure in `session.end` catch does not propagate (ANO-005)
- MRV-005: `wasGuided` stored correctly in live history entries

---

## Documentation Update

Documentation reconciliation: required and completed.

| File | Change | Reason |
|---|---|---|
| `AGENTS.md` | Version, test command, Current Work | Version was stale; test command was wrong (`npm test` → `claude plugin test .`) |
| `docs/roadmap.md` | ES-012, ES-013 entries; ES-011 evaluation status | ES-012 was absent; ES-011 incorrectly implied as current |
| `.claude-plugin/plugin.json` | Version bump 1.0.1 → 1.0.2 | Standard per-story version bump |

**Documentation update: Moderate — version corrections and accuracy improvements. No new documentation sections created.**

---

## Vault Outcome

Vault was not consulted during Repository Analysis. This is an in-repo plugin stabilization story with no cross-project architectural content warranting vault consultation.

**Vault outcome: No action.**

---

## Modified Files

| File | Change |
|---|---|
| `hooks/register.tsx` | +16/-10 — wasGuided TDZ fix, paneAtom initial state, prefsAtom guard, secondary catch |
| `src/metrics/normalize.ts` | +2 — wasGuided in MakeEntryParams + makeEntry |
| `types/index.d.ts` | +2 — prefs key in PluginState |
| `src/guide/instructions.test.ts` | +3/-1 — threshold 600 → 700 with comment |
| `AGENTS.md` | version, test command, Current Work |
| `docs/roadmap.md` | ES-012/013 entries, ES-011 clarification |
| `.claude-plugin/plugin.json` | version 1.0.1 → 1.0.2 |

New files (story artifacts):
- `docs/stories/ES-013-guided-compaction-stabilization.md`
- `docs/stories/ES-013-repository-analysis.md`
- `docs/stories/ES-013-implementation-plan.md`
- `docs/stories/ES-013-implementation-report.md` (this file)
- `hooks/register.test.ts` (new test file, shipped)
