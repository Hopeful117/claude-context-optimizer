# ES-013 — Repository Analysis

- Story: `docs/stories/ES-013-guided-compaction-stabilization.md`
- Date: 2026-11-17
- Analyst: Claude Sonnet 4.6
- Status: **Ready for Gate 1 Approval**

---

## 1. Repository State

| Item | Value |
|---|---|
| Branch | `claude/guided-compaction-stabilization-9e0609` |
| HEAD | `5870bcb` |
| `plugin.json` version | `1.0.1` |
| `AGENTS.md` version | `v0.9.1` (stale — see §6) |
| Last story merged | ES-012 — Persistent Guidance Toggle State |
| Test runner | `claude plugin test .` (not `npm test` — see §6) |
| Known test failures | 1 — `PRESERVATION_TEMPLATE: within reasonable length` |
| TypeScript compilation | Fails — ANO-002 (see §4.2) |

---

## 2. Affected Modules

| Module | Relevance |
|---|---|
| `hooks/register.tsx` | Primary: contains ANO-001, ANO-002, ANO-005, ANO-006 |
| `types/index.d.ts` | ANO-002 (PaneSnapshot contract), ANO-003 (PluginState) |
| `src/metrics/normalize.ts` | ANO-001 (`makeEntry` / `MakeEntryParams` missing `wasGuided`) |
| `src/guide/instructions.ts` | ANO-004 (template length) |
| `src/guide/instructions.test.ts` | ANO-004 (failing test) |
| `docs/roadmap.md` | Stale — ES-011/ES-012 state incorrect |
| `AGENTS.md` | Stale version; test command incorrect |

---

## 3. Architecture Constraints (ADRs)

**ADR-001** — Observer only, fail-open, never introduce pipeline latency. `next(event)` must always be called.

**ADR-002** — No conversation content stored or transmitted. Guidance injection reads only boolean flags.

**ADR-003** — Deterministic recommendations, no LLM/network. Advisor untouched by this story.

**ADR-004** — Two-toggle consent model (`guideEnabled` for manual/plugin, `autoGuideEnabled` for auto). `precompute` permanently excluded. Fail-open on composition error. `wasGuided` history marker introduced.

All ADRs remain binding. No ADR changes in scope.

---

## 4. Anomaly Analysis

### ANO-001 — Variable used before declaration (`wasGuided` TDZ)

**File:** `hooks/register.tsx`, `session.compact` handler (lines ~369–382)

**Root cause:** In the `try` block of the post-compaction state update:
```typescript
const entry = makeEntry({
  ...
  wasGuided,          // ← LINE A: accessed here (TDZ — ReferenceError at runtime)
});
await update($, historyAtom, ...);

const wasGuided = shouldGuide;   // ← LINE B: declared here, after use
$.ui.status(`ctx:${wasGuided ? ...}`);
```
`const` is not hoisted like `var`. Accessing `wasGuided` at LINE A throws `ReferenceError: Cannot access 'wasGuided' before initialization`. This exception is caught by the surrounding `catch` block, which calls `$.ui.status('ctx:err')`. The practical effect: every compaction records no entry in history, and status always shows `ctx:err` regardless of guidance state.

**Secondary issue:** `makeEntry` and its `MakeEntryParams` type do not include `wasGuided`. Passing `wasGuided` to `makeEntry` is a TypeScript excess property error. Even if the TDZ were fixed, `makeEntry` would silently drop the value and return a `HistoryEntry` with `wasGuided: undefined`.

**Tertiary issue:** `wasGuided = shouldGuide` reflects intent (did we try to guide?), not actual injection (did it succeed?). If `composeInstructions()` throws, `shouldGuide` remains `true` but the event passed to `next()` is the original unmodified event.

**Confirmed:** Yes. All three sub-issues confirmed by code inspection.

**Required fixes:**
1. Declare `wasGuided` before the `makeEntry` call.
2. Set `wasGuided` based on actual injection success: `wasGuided = eventToPass !== event`.
3. Add `wasGuided?: boolean` to `MakeEntryParams` and return it from `makeEntry`.

---

### ANO-002 — Incomplete initial state of `paneAtom`

**File:** `hooks/register.tsx` (lines ~30–47), `types/index.d.ts` (line ~67)

**Root cause:** ES-012 added `rememberPrefs: boolean` to `PaneSnapshot` as a required field, but the `paneAtom` initial value (checked via `satisfies PaneSnapshot`) does not include it:

```typescript
const paneAtom = atom(
  { plugin: 'context-optimizer', key: 'pane' } as const,
  {
    // ... all other PaneSnapshot fields ...
    guideEnabled: false,
    autoGuideEnabled: false,
    // rememberPrefs is MISSING
  } satisfies PaneSnapshot,   // ← TypeScript compile error
  { shape: 'pane-3' },
);
```

TypeScript `satisfies` enforces structural conformance. Missing `rememberPrefs: boolean` is a hard compile-time error.

**Additional observation:** The `session.start` and `session.end` handlers DO include `rememberPrefs` in their `update()` calls, so the atom is immediately updated after initialization. But the initial value (used when no persisted state exists) is non-conforming.

**Shape note:** `pane-3` is correct. ES-011 bumped from `pane-2` to `pane-3` for the `autoGuideEnabled` field. ES-012 implementation report incorrectly states "pane-2 retained" — that refers to the ES-012 scope where ES-012 itself didn't require a shape bump. The current shape `pane-3` is the ES-011 value and is correct.

**Confirmed:** Yes. TypeScript compilation fails.

**Required fix:** Add `rememberPrefs: false` to the `paneAtom` initial value.

---

### ANO-003 — `PluginState` missing `'prefs'` key

**File:** `types/index.d.ts` (lines ~70–80)

**Root cause:** ES-012 introduced `prefsAtom` with key `'prefs'`, but the `PluginState` module augmentation was not updated:

```typescript
declare module 'claude-code' {
  interface PluginState {
    'context-optimizer': {
      history: Shaped<MetricsHistory>;
      pane: Shaped<PaneSnapshot>;
      metrics: Shaped<null>;   // migration shim
      // 'prefs' key is MISSING
    };
  }
}
```

The type `Shaped<{ rememberPrefs: boolean; guideEnabled: boolean }>` for the `prefs` key needs to be added.

**Severity:** TypeScript type contract gap. Depending on how the SDK's `atom()` function validates the key against `PluginState`, this may be a compile error or only a type-safety gap. At minimum it is a contract violation — the SDK cannot statically verify that the atom key is valid.

**Required fix:** Add `prefs: Shaped<{ rememberPrefs: boolean; guideEnabled: boolean }>` to the `PluginState` interface.

---

### ANO-004 — Template length test threshold stale

**File:** `src/guide/instructions.test.ts` (line 101), `src/guide/instructions.ts`

**Root cause:** The test `PRESERVATION_TEMPLATE: within reasonable length` asserts:
```typescript
expect(PRESERVATION_TEMPLATE.length).toBeLessThan(600);
```

Measured template length: **640 characters**. All 7 ADR-004 preservation categories are present and each contributes meaningfully. No category can be removed without violating ADR-004.

**Analysis:** The 600-character threshold was set before the template reached its current form. The template is not bloated — each line maps directly to an ADR-004 required category. The test threshold is the stale element.

**Correct fix:** Raise the threshold to 700. This provides a meaningful guard against unintended template growth while accommodating the current 640-character template.

**Do not:** truncate the template, remove categories, or abbreviate lines to satisfy an arbitrary historical number.

**Confirmed:** Yes. 1 test fails. Template is ADR-compliant at 640 chars.

---

### ANO-005 — Inconsistent error handling in `session.compact` and `session.end`

**File:** `hooks/register.tsx`

**Root cause:** `session.start`, `session.measure`, and `turn.complete` wrap the status call in a secondary `try/catch`:
```typescript
} catch {
  try { $.ui.status('ctx:err'); } catch { /* ignore observability-only failure */ }
}
```

But `session.compact` and `session.end` do not:
```typescript
} catch {
  $.ui.status('ctx:err');   // ← unprotected: if status() throws, exception propagates
}
```

**Impact:** If `$.ui.status()` throws inside the `catch` block of `session.compact` or `session.end`, that exception propagates. For `session.end`, `next(event)` has already been called (at the top), so the compaction/clear has completed — the propagating exception is cosmetic. For `session.compact`, `next(eventToPass)` is called before the state update block, so the same applies. ADR-001's fail-open guarantee is effectively met, but the inconsistency is a correctness gap and a maintenance hazard.

**Additional finding in `session.compact`:** `next(eventToPass)` is called outside any `finally` block. For `session.start`, `session.measure`, `turn.complete`, and `session.end`, `next()` is called in a position that guarantees it fires regardless of earlier errors. For `session.compact`, the guidance injection try/catch ensures fail-open, but `next(eventToPass)` is not inside a `finally`. If an unexpected error occurs between guidance injection and the `next()` call (not currently possible, but a maintenance risk), `next()` could be skipped.

**Confirmed:** Yes. The inconsistency is real, though current practical impact is low.

**Required fix:**
- Wrap `$.ui.status('ctx:err')` in secondary `try/catch` in `session.compact` and `session.end`.
- No structural change to `next(eventToPass)` call needed (guidance injection is intentionally pre-`next`).

---

### ANO-006 — Toggle state consistency

**File:** `hooks/register.tsx` (pane render toggle handlers)

**Root cause analysis of reported scenarios:**

| Scenario | Current behavior | Issue? |
|---|---|---|
| Manual guidance activation | `toggleGuide` sets `newVal = !snap.guideEnabled` | Correct |
| Manual guidance deactivation | Same | Correct |
| Remember activation | `toggleRemember` saves current `snap.guideEnabled` to `prefsAtom` | Correct |
| Remember deactivation | `prefsAtom.rememberPrefs = false`, `guideEnabled` saved | Correct |
| New session | `session.start` reads `prefsAtom`, applies `rememberPrefs` logic | Correct |
| `/clear` | `session.end(reason='clear')` resets pane, reads `prefsAtom` | Correct |
| Session resume | `session.end(reason='resume')` resets pane, reads `prefsAtom` | Correct |
| Mod restart | `prefsAtom` persists in `$.store`; restored on next `session.start` | Correct |
| `prefsAtom` read failure | `session.start` has no error handling for `read($, prefsAtom)` | **Issue** |
| `prefsAtom` write failure | `void update(...)` — failure is silently dropped | Acceptable |

**Key finding — `prefsAtom` read failure not handled:** In `session.start`:
```typescript
const prefs = await read($, prefsAtom);    // ← no try/catch
await update($, paneAtom, () => ({
  ...
  guideEnabled: prefs.rememberPrefs ? prefs.guideEnabled : false,
  rememberPrefs: prefs.rememberPrefs,
}));
```
If `read($, prefsAtom)` throws, the exception propagates to the outer `try/catch` and the entire session start initialization fails. The `paneAtom` is not reset. This is handled (the outer catch calls status), but it means pane state may be stale from the previous session. A defensive read with a default fallback would be safer.

The same pattern exists in `session.end`.

**Race condition analysis:** `toggleGuide` captures `newVal = !snap.guideEnabled` from the render-time snapshot. Rapid double-press before re-render would use the same `snap.guideEnabled`, resulting in both updates setting the same `newVal`. The atom update callback `m => ({ ...m, guideEnabled: newVal })` is correct (it doesn't toggle relative to the current atom state, it sets an absolute value from the closure). Two rapid presses with the same `snap` would both set `guideEnabled` to the same value — effectively a no-op for the second press. This is a UI-level debounce issue, not a data-corruption risk.

**`autoGuideEnabled` persistence:** ADR-004 requires `autoGuideEnabled` to reset on session start/end. The code correctly resets it. No persistence of `autoGuideEnabled` exists or is intended. This is correct per ADR-004.

**Confirmed:** One real issue (`prefsAtom` read not guarded in session init handlers). Race condition is a known fire-and-forget SDK constraint, not a bug.

**Required fix:**
- Wrap `read($, prefsAtom)` in `session.start` and `session.end` with a try/catch that provides a safe default: `const prefs = await read($, prefsAtom).catch(() => ({ rememberPrefs: false, guideEnabled: false }))` or equivalent.

---

## 5. Test Infrastructure

**Test runner:** `/home/ludo/.config/Claude/claude-code/X.Y.Z/hash/claude plugin test .`

The repository has no `package.json`, no `node_modules`, no npm scripts. The `npm test` and `npm run build` commands in `AGENTS.md` and `TOOLS.md` are **incorrect** — they cannot be run. The actual test command is `claude plugin test .` from the Claude Code CLI.

**Current test count:** 142 tests across 9 files (from ES-012 implementation report).

**Test files:**
- `src/guide/instructions.test.ts` — 1 known failure (ANO-004)
- `src/advisor/engine.test.ts`, `evaluation.test.ts`, `rules.test.ts`
- `src/metrics/history.test.ts`, `normalize.test.ts`
- `src/pane/format.test.ts`, `trend.test.ts`
- `src/perf/timing.test.ts`

**No existing test file for `hooks/register.tsx`.** The handlers (ANO-001, ANO-005, ANO-006) have no unit tests. New regression tests are required.

---

## 6. Documentation Discrepancies

| Item | Current state | Correct state |
|---|---|---|
| `AGENTS.md` version | `v0.9.1` | `v1.0.1` (actual `plugin.json` version) |
| `AGENTS.md` test command | `npm test` / `npm run build` | `claude plugin test .` |
| `AGENTS.md` Current Work | ES-012 "implemented" (Pending PR) | ES-012 merged; ES-013 in progress |
| `docs/roadmap.md` | Shows ES-011 as `← _current_`; no ES-012 or ES-013 | Needs ES-012 entry and ES-013 entry |
| `docs/roadmap.md` Phase 3 exit gate | "comparative evaluation pending" | Still pending — evaluation not yet run |
| `plugin.json` description | "Persistent guidance toggle + auto trigger support — v1.0.1 (ES-012)" | Will need bump to v1.0.2 for ES-013 |

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ANO-001 TDZ causes silent history corruption on every compaction | High (confirmed bug) | Fix declared order and `makeEntry` params |
| ANO-002 compile failure prevents plugin loading | Confirmed | Add `rememberPrefs: false` to initial state |
| ANO-003 SDK type mismatch causes atom validation error | Medium | Add `prefs` key to `PluginState` |
| ANO-004 test failure blocks CI | Confirmed (1 failure) | Raise threshold to 700 |
| Fix introduces regression in `wasGuided` logic | Low | Strict unit tests for compact handler |
| `makeEntry` change breaks existing normalize tests | Low | `wasGuided` is optional; existing test expectations unchanged |

---

## 8. Implementation Scope Summary

**Files to modify:**
1. `hooks/register.tsx` — ANO-001, ANO-002 (paneAtom initial), ANO-005, ANO-006
2. `types/index.d.ts` — ANO-002 (PaneSnapshot already correct), ANO-003 (PluginState)
3. `src/metrics/normalize.ts` — ANO-001 (`MakeEntryParams` + `makeEntry`)
4. `src/guide/instructions.test.ts` — ANO-004 (threshold)
5. `src/metrics/normalize.test.ts` — ANO-001 (verify `wasGuided` propagation)
6. New: `hooks/register.test.ts` (or `src/handlers/compact.test.ts`) — regression tests for compact handler, toggle state, `wasGuided` accuracy
7. `AGENTS.md` — documentation fixes
8. `docs/roadmap.md` — documentation fixes

**No changes to:** ADRs, `src/advisor/`, `src/pane/`, `src/perf/`, `hooks/hooks.json`, `docs/stories/ES-011*` (evaluation not yet run).

---

## 9. Vault Consultation

Not applicable. This is an in-repo plugin stabilization story with no cross-project architectural content warranting vault consultation.

---

## 10. Recommendation

**Proceed to Gate 1 approval.** All six anomalies are confirmed. The implementation scope is well-bounded: 7 file modifications + 1 new test file. No architectural changes required. No ADR revisions required. No new features.

The critical path is ANO-001 + ANO-002 (compile errors) → ANO-003 (type contract) → ANO-004 (test) → ANO-005/006 (resilience). All fixes are independent and can be sequenced per plan.
