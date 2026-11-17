# ES-012 — Implementation Plan: Persistent Guidance Toggle State

- Story: `docs/stories/ES-012-persistent-guidance-toggle.md`
- Analysis: `docs/stories/ES-012-repository-analysis.md` ✅ Approved 2026-11-17
- Planner: Claude Sonnet 4.6
- Date: 2026-11-17
- Status: **Ready for Gate 2 approval**

---

## Objective

Implement `rememberPrefs` — a persistent preference that saves the user's `guideEnabled` choice to `$.store` and restores it on session start.

---

## Steps

### Step 1 — Extend `PaneSnapshot` type (`types/index.d.ts`)

Add one field after `guideEnabled`:

```ts
/** ES-012: whether the guidance toggle preference is persisted across sessions. */
rememberPrefs: boolean;
```

No shape change to `paneAtom`. Existing persisted state has `rememberPrefs: undefined` → treated as `false`.

---

### Step 2 — Declare `prefsAtom` (`hooks/register.tsx`)

Add after the `historyAtom` declaration, before the helpers section:

```ts
// Persistent preferences — never reset on session start.
// Stores guideEnabled preference when rememberPrefs is true.
const prefsAtom = atom(
  { plugin: 'context-optimizer', key: 'prefs' } as const,
  { rememberPrefs: false, guideEnabled: false },
  { shape: 'prefs-1' },
);
```

---

### Step 3 — Update `session.start` handler

Replace the current hard-reset of `paneAtom` with a prefs-aware version:

```ts
// Before:
await update($, paneAtom, () => ({
  turns: 0, ..., guideEnabled: false,
}));

// After:
const prefs = await read($, prefsAtom);
await update($, paneAtom, () => ({
  turns: 0,
  measurements: 0,
  compactionCount: 0,
  sessionId: sid,
  model: model ?? null,
  context: null,
  apiUsage: null,
  rateLimits: [],
  costUsd: null,
  lastCompactTrigger: null,
  guideEnabled: prefs.rememberPrefs ? prefs.guideEnabled : false,
  rememberPrefs: prefs.rememberPrefs,
}));
```

---

### Step 4 — Update `session.end` handler (clear/resume)

Same pattern as Step 3 — read `prefsAtom` before the `paneAtom` reset:

```ts
const prefs = await read($, prefsAtom);
await update($, paneAtom, () => ({
  ...,
  guideEnabled: prefs.rememberPrefs ? prefs.guideEnabled : false,
  rememberPrefs: prefs.rememberPrefs,
}));
```

---

### Step 5 — Update `toggleGuide` and add `toggleRemember` (inside `ui.render`)

Replace the current `toggleGuide` const and add `toggleRemember` before it:

```ts
// ES-012: persist guidance preference when rememberPrefs is active.
const toggleGuide = () => {
  const newVal = !snap.guideEnabled;
  void update($, paneAtom, m => ({ ...m, guideEnabled: newVal }));
  if (snap.rememberPrefs) {
    void update($, prefsAtom, p => ({ ...p, guideEnabled: newVal }));
  }
};

const toggleRemember = () => {
  const newVal = !snap.rememberPrefs;
  void update($, paneAtom, m => ({ ...m, rememberPrefs: newVal }));
  void update($, prefsAtom, () => ({
    rememberPrefs: newVal,
    guideEnabled: snap.guideEnabled,
  }));
};
```

Both use `void` (fires-and-forgets) — consistent with the existing `toggleGuide` pattern and the `onPress: () => void` constraint.

---

### Step 6 — Update pane render (Compaction Guidance section)

Replace the existing `<Box>` for the guidance toggle with a version that includes the Remember button:

```tsx
{/* ES-010/ES-012: Compaction Guidance prototype toggle */}
<Box flexDirection="column">
  <Text bold>Compaction Guidance <Text dimColor>(prototype)</Text></Text>
  <Box flexDirection="row">
    <Button
      onPress={toggleGuide}
      variant={snap.guideEnabled ? 'primary' : undefined}
    >
      {snap.guideEnabled ? '● Active' : '○ Disabled'}
    </Button>
    <Text dimColor>
      {'  '}{snap.guideEnabled
        ? 'Augments /compact with preservation hints'
        : 'Enable to guide /compact summaries'}
    </Text>
  </Box>
  <Box flexDirection="row">
    <Button
      onPress={toggleRemember}
      variant={snap.rememberPrefs ? 'primary' : undefined}
    >
      {snap.rememberPrefs ? '◉ Remember' : '○ Remember'}
    </Button>
    <Text dimColor>
      {'  '}{snap.rememberPrefs
        ? 'Preference saved — restored on next session'
        : 'Preference resets each session'}
    </Text>
  </Box>
</Box>
```

---

## Validation

After implementation:

1. **TypeScript build:** `npm run build` — zero errors.
2. **Vitest:** `npm test` — all existing tests pass, no regressions.
3. **Manual smoke test** (pane in Claude Desktop):
   - Enable guidance, enable Remember → restart session → guidance should be restored as active.
   - Disable guidance while Remember is on → restart → guidance should be restored as disabled.
   - Disable Remember → restart → guidance should start as disabled regardless of saved value.

---

## Files Changed

| File | Nature |
|---|---|
| `types/index.d.ts` | Add `rememberPrefs: boolean` to `PaneSnapshot` |
| `hooks/register.tsx` | Add `prefsAtom`; update `session.start`, `session.end`, `ui.render` |

No new files. No documentation update required (behavior is additive; `AGENTS.md` notes the story as in-progress — will be updated to completed in Documentation Reconciliation).

---

## Out of Scope

- ES-011 comparative evaluation — unrelated, independent gate.
- Persisting any other pane state (turns, context fill, etc.) — not requested.
- Migration of existing sessions — not needed; `undefined` → `false` default is safe.
