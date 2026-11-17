# ES-013 — Implementation Plan

- Story: `docs/stories/ES-013-guided-compaction-stabilization.md`
- Repository Analysis: `docs/stories/ES-013-repository-analysis.md` ✅ Approved 2026-11-17
- Date: 2026-11-17
- Status: **Ready for Gate 2 Approval**

---

## Constraints

- No new features, no new toggles, no behavior changes beyond bug fixes.
- No ADR changes.
- All existing tests must continue to pass after each step.
- `satisfies PaneSnapshot` must pass TypeScript after ANO-002 fix.
- `wasGuided` must reflect actual injection, not intent.
- Error handling must remain fail-open: `next(event)` must always be called.

---

## Step 1 — ANO-001: Fix `wasGuided` TDZ + `makeEntry` contract

### 1a. `src/metrics/normalize.ts`

Add `wasGuided?: boolean` to `MakeEntryParams` and propagate it in `makeEntry`:

```typescript
type MakeEntryParams = {
  // ... existing fields ...
  wasGuided?: boolean;
};

export function makeEntry(params: MakeEntryParams): HistoryEntry {
  // ... existing logic ...
  return {
    // ... existing fields ...
    compactTrigger: params.compactTrigger ?? null,
    wasGuided: params.wasGuided,
  };
}
```

`wasGuided` is optional (`?`) — no change to existing callers. `HistoryEntry.wasGuided?: boolean` already exists in `types/index.d.ts`.

### 1b. `hooks/register.tsx` — `session.compact` post-compaction block

Move `wasGuided` declaration before `makeEntry`. Set it based on actual injection:

```typescript
// Before the try block:
const wasGuided = eventToPass !== event;

// Inside try block:
const entry = makeEntry({
  // ...
  compactTrigger: event.trigger,
  wasGuided,
});
await update($, historyAtom, h => appendEntry(recordCompaction(h), entry));

$.ui.status(`ctx:${wasGuided ? 'guided-' : ''}compacted(${event.trigger})`);
```

Remove the original `const wasGuided = shouldGuide;` line that appeared after `makeEntry`.

**Rationale:** `eventToPass !== event` is true only when `composeInstructions()` succeeded and returned a new object. If `shouldGuide` was true but composition threw, `eventToPass === event`, so `wasGuided` is correctly `false`. This eliminates false positives.

**Structural note:** `wasGuided` must be declared BEFORE the `try` block so it is in scope for both the `$.ui.status` call and `makeEntry`. It captures `eventToPass !== event`, which is already determined before `next()` is called.

---

## Step 2 — ANO-002: Fix `paneAtom` initial state

### `hooks/register.tsx` — `paneAtom` declaration

Add `rememberPrefs: false` to the initial value:

```typescript
const paneAtom = atom(
  { plugin: 'context-optimizer', key: 'pane' } as const,
  {
    turns: 0,
    measurements: 0,
    compactionCount: 0,
    sessionId: null,
    model: null,
    context: null,
    apiUsage: null,
    rateLimits: [],
    costUsd: null,
    lastCompactTrigger: null,
    guideEnabled: false,
    autoGuideEnabled: false,
    rememberPrefs: false,         // ← added
  } satisfies PaneSnapshot,
  { shape: 'pane-3' },
);
```

No shape bump required — adding a field with the existing default value is not a breaking change. Existing persisted `pane-3` state from sessions before ES-012 may be missing `rememberPrefs`; at first read the SDK will return the initial value with `rememberPrefs: false`, which is the correct default.

---

## Step 3 — ANO-003: Add `'prefs'` key to `PluginState`

### `types/index.d.ts`

Add the `prefs` key to the module augmentation:

```typescript
declare module 'claude-code' {
  interface PluginState {
    'context-optimizer': {
      history: Shaped<MetricsHistory>;
      pane: Shaped<PaneSnapshot>;
      metrics: Shaped<null>;
      prefs: Shaped<{ rememberPrefs: boolean; guideEnabled: boolean }>;  // ← added
    };
  }
}
```

No shape change — `prefsAtom` already declares `shape: 'prefs-1'`.

---

## Step 4 — ANO-004: Fix template length test threshold

### `src/guide/instructions.test.ts`

Change the threshold from `600` to `700`:

```typescript
test('PRESERVATION_TEMPLATE: within reasonable length', () => {
  expect(PRESERVATION_TEMPLATE.length).toBeLessThan(700);
});
```

**Justification:** Template is 640 characters. All 7 ADR-004 categories are required. The threshold serves as a guard against unintended growth, not as a compression target. 700 provides a 60-character margin and remains a meaningful limit.

No change to `src/guide/instructions.ts`.

---

## Step 5 — ANO-005: Consistent error handling in compact and end handlers

### `hooks/register.tsx` — `session.compact` and `session.end`

Wrap the unprotected `$.ui.status('ctx:err')` calls in secondary `try/catch`, matching the pattern used in all other handlers:

**`session.compact` catch:**
```typescript
} catch {
  try { $.ui.status('ctx:err'); } catch { /* ignore observability-only failure */ }
}
```

**`session.end` catch:**
```typescript
} catch {
  try { $.ui.status('ctx:err'); } catch { /* ignore observability-only failure */ }
}
```

No other structural change.

---

## Step 6 — ANO-006: Guard `prefsAtom` read in session init handlers

### `hooks/register.tsx` — `session.start` and `session.end`

Replace the unguarded `read($, prefsAtom)` with a failure-safe pattern:

```typescript
// Before (session.start and session.end):
const prefs = await read($, prefsAtom);

// After:
const prefs = await read($, prefsAtom).catch(() => ({ rememberPrefs: false, guideEnabled: false }));
```

This ensures that if the atom read fails (store unavailable, corrupted state), the session initializes with safe defaults rather than propagating the error to the outer catch — which would leave `paneAtom` in its previous (potentially stale) state.

---

## Step 7 — Regression tests for compact handler and toggles

### New file: `hooks/register.test.ts`

Vitest unit tests covering the behaviors specified in the story. Tests mock SDK primitives (`$`, `read`, `update`, `atom`).

**Test groups:**

#### Compact handler — `wasGuided` accuracy
- guidance disabled → `wasGuided: false`, original event passed to `next()`
- guidance enabled + manual trigger → `wasGuided: true`, composed event passed
- guidance enabled + plugin trigger → `wasGuided: true`
- guidance enabled + auto trigger + `autoGuideEnabled: false` → `wasGuided: false`
- `autoGuideEnabled: true` + auto trigger → `wasGuided: true`
- precompute trigger (all flags on) → `wasGuided: false`
- composition error → `wasGuided: false`, original event passed (fail-open)

#### Compact handler — `next()` call semantics
- exactly one `next()` call in all paths
- `next()` receives original event when guidance off or error

#### Compact handler — post-compaction state
- `compactionCount` incremented
- `lastCompactTrigger` updated
- `wasGuided` stored in history entry

#### Toggle state — `rememberPrefs`
- `remember` off by default
- activating `remember` saves `guideEnabled` to `prefsAtom`
- deactivating `remember` saves `rememberPrefs: false`
- `prefsAtom` read failure → safe default fallback in `session.start`

---

## Step 8 — Documentation fixes

### `AGENTS.md`
- Version: `v0.9.1` → `v1.0.2` (after implementation)
- Test commands: replace `npm test` / `npm run build` with `claude plugin test .`
- Current Work: reflect ES-012 merged, ES-013 in progress

### `docs/roadmap.md`
- Add ES-012 entry under Phase 3
- Add ES-013 entry under Phase 3
- Phase 3 exit gate: clarify that comparative evaluation is still pending
- Do NOT mark ES-011 evaluation as complete

### `.claude-plugin/plugin.json`
- Version: `1.0.1` → `1.0.2`

---

## Execution Sequence

```
Step 1a  src/metrics/normalize.ts        — MakeEntryParams + makeEntry wasGuided
Step 1b  hooks/register.tsx              — wasGuided TDZ fix (session.compact)
Step 2   hooks/register.tsx              — paneAtom initial rememberPrefs
Step 3   types/index.d.ts               — PluginState prefs key
Step 4   src/guide/instructions.test.ts  — threshold 600 → 700
Step 5   hooks/register.tsx              — session.compact + session.end catch
Step 6   hooks/register.tsx              — prefsAtom read guard
Step 7   hooks/register.test.ts          — new regression tests
Step 8   AGENTS.md, docs/roadmap.md, .claude-plugin/plugin.json — docs
```

Steps 1–6 are code fixes. Step 7 is testing. Step 8 is documentation.
Steps 1–6 can be applied in a single pass to `hooks/register.tsx` (most changes are there).

---

## Validation

After implementation:

```bash
claude plugin test .
```

Expected: all 142 + N new tests pass. Zero TypeScript errors. Zero known failures.

The `wasGuided` accuracy tests will serve as regression guard for ANO-001 beyond this story.

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `wasGuided = eventToPass !== event` changes recorded values for future sessions | Yes — this is intentional and correct. Recorded `wasGuided: true` previously was always `undefined` (makeEntry dropped it). No prior data to corrupt. |
| `makeEntry` change breaks existing normalize tests | `wasGuided` is optional — all existing callers omit it, all existing test expectations are unchanged. |
| Shape bump not needed for `pane-3` | Confirmed — adding `rememberPrefs: false` to initial value is not a breaking change. SDK treats missing atom fields as defaults. |
| New test file uses SDK mocks incorrectly | Tests will use the same `claude-code/testing` harness as existing tests. Mock approach will follow the existing test patterns in `src/metrics/normalize.test.ts`. |
