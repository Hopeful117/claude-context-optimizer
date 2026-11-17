# ES-012 — Repository Analysis: Persistent Guidance Toggle State

- Story: `docs/stories/ES-012-persistent-guidance-toggle.md`
- Analyst: Claude Sonnet 4.6
- Date: 2026-11-17
- Status: **Ready for Gate 1 approval**

---

## Summary

ES-012 adds a "Remember preferences" toggle to the Compaction Guidance section. When enabled, the user's `guideEnabled` choice persists across sessions via a new `prefsAtom` stored in `$.store`. Scope is narrow: one new atom, one new field on `PaneSnapshot`, two touch-points in `session.start` / `session.end`, and two toggle handlers in `ui.render`. No compaction logic is affected.

---

## Story

**Goal:** Persist the `guideEnabled` toggle state so users who enable compaction guidance once do not have to re-enable it on every session restart.

**Constraint:** Must not alter any compaction behavior. Only the initial value of `guideEnabled` at session start is affected.

**Architecture authority:** ADR-004 (`docs/architecture/ADR-004-user-controlled-compaction-intelligence.md`) — user-controlled only, no autonomous behavior.

---

## Vault Consultation

Not consulted. The story is entirely within this repository's plugin implementation; no cross-project transverse knowledge applies.

---

## DevLog Context

No TOOLS.md DevLog configuration was available at analysis time (TOOLS.md created as part of this story — `scripts/devlog-story.mjs` does not yet exist). Repository inspection is the primary evidence source.

---

## Repository Evidence

### Current `guideEnabled` lifecycle

**Atom declaration** (`hooks/register.tsx:36–47`)
```ts
const paneAtom = atom(
  { plugin: 'context-optimizer', key: 'pane' } as const,
  {
    ...
    guideEnabled: false,  // added ES-010
  } satisfies PaneSnapshot,
  { shape: 'pane-2' },
);
```
Shape `'pane-2'` was bumped in ES-010 to clear old `pane-1` state when `guideEnabled` was introduced.

**`session.start` reset** (`hooks/register.tsx:102–116`)
Hard-resets `paneAtom` to its zero state including `guideEnabled: false`. This runs on every new session.

**`session.end` reset** (`hooks/register.tsx:~195–220`)
Same hard-reset, triggered for `reason === 'clear'` and `reason === 'resume'`.

**Toggle handler** (`hooks/register.tsx`, inside `ui.render`)
```ts
const toggleGuide = () => {
  void update($, paneAtom, m => ({ ...m, guideEnabled: !m.guideEnabled }));
};
```
Only updates `paneAtom`. No persistence today.

**`session.compact` consumer** (`hooks/register.tsx`)
Reads `paneAtom.guideEnabled` to decide whether to inject guidance. No change needed here.

### Type contract (`types/index.d.ts`)
```ts
export type PaneSnapshot = {
  ...
  guideEnabled: boolean;
  // rememberPrefs: boolean  ← to be added (ES-012)
};
```

---

## Proposed Design

### New atom: `prefsAtom`

```ts
const prefsAtom = atom(
  { plugin: 'context-optimizer', key: 'prefs' } as const,
  { rememberPrefs: false, guideEnabled: false },
  { shape: 'prefs-1' },
);
```

- **Never reset** — no reference to it in `session.start` or `session.end`.
- Stores two booleans: the user's preference to remember, and the saved guide state.
- Shape `'prefs-1'` is new — no existing state to migrate.

### `PaneSnapshot` extension (`types/index.d.ts`)

Add one field:
```ts
rememberPrefs: boolean;  // ES-012: whether guidance preference is persisted
```

No shape bump to `paneAtom` is needed: `paneAtom` shape `'pane-2'` already carries `rememberPrefs: boolean` implicitly after the type update. The existing stored value will be `undefined` → treated as `false` by the runtime; no explicit migration needed.

> **Alternative considered:** bump `pane-2` → `pane-3`.
> **Decision:** No bump. `rememberPrefs` defaults to `false`, and `undefined` is falsy. Bumping would clear turn counts and context state for the current session, which is unnecessary. The soft-default is safe.

### `session.start` change

After reading `prefsAtom`:
```ts
const prefs = await read($, prefsAtom);
const initialGuideEnabled = prefs.rememberPrefs ? prefs.guideEnabled : false;
await update($, paneAtom, () => ({
  ...zeroState,
  guideEnabled: initialGuideEnabled,
  rememberPrefs: prefs.rememberPrefs,
}));
```

### `session.end` change (clear/resume)

Same pattern as `session.start` — read `prefsAtom` before writing `paneAtom`.

### Toggle handlers (in `ui.render`)

**`toggleGuide`:**
```ts
const toggleGuide = async () => {
  const newVal = !snap.guideEnabled;
  await update($, paneAtom, m => ({ ...m, guideEnabled: newVal }));
  if (snap.rememberPrefs) {
    await update($, prefsAtom, p => ({ ...p, guideEnabled: newVal }));
  }
};
```

**`toggleRemember`:**
```ts
const toggleRemember = async () => {
  const newVal = !snap.rememberPrefs;
  await update($, paneAtom, m => ({ ...m, rememberPrefs: newVal }));
  await update($, prefsAtom, p => ({
    rememberPrefs: newVal,
    guideEnabled: snap.guideEnabled,  // save current state when enabling
  }));
};
```

### Pane render change

Replace the current toggle section with:
```tsx
<Box flexDirection="column">
  <Text bold>Compaction Guidance <Text dimColor>(prototype)</Text></Text>
  <Box flexDirection="row">
    <Button onPress={toggleGuide} variant={snap.guideEnabled ? 'primary' : undefined}>
      {snap.guideEnabled ? '● Active' : '○ Disabled'}
    </Button>
    <Text dimColor>
      {'  '}{snap.guideEnabled
        ? 'Augments /compact with preservation hints'
        : 'Enable to guide /compact summaries'}
    </Text>
  </Box>
  <Box flexDirection="row">
    <Button onPress={toggleRemember} variant={snap.rememberPrefs ? 'primary' : undefined}>
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

## Files to Change

| File | Change |
|---|---|
| `types/index.d.ts` | Add `rememberPrefs: boolean` to `PaneSnapshot` |
| `hooks/register.tsx` | Add `prefsAtom`; update `session.start`, `session.end`, toggle handlers, pane render |

No new modules. No test file changes (new behavior is in hooks, not pure functions — but see risk below).

---

## Affected Modules

- `hooks/register.tsx` — primary change surface
- `types/index.d.ts` — type contract

Unaffected: `src/metrics/`, `src/advisor/`, `src/guide/`, `src/pane/`, `src/perf/`.

---

## ADR Impact

**ADR-004 (User-Controlled Compaction Intelligence):** No impact. The user explicitly toggles both `guideEnabled` and `rememberPrefs`. No autonomous behavior.

**ADR-002 (Observability and Privacy):** `prefsAtom` stores two boolean flags only — no content, no conversation data. Compliant.

---

## Risks and Constraints

| Risk | Severity | Mitigation |
|---|---|---|
| `toggleGuide` / `toggleRemember` are `void` in current code — `ui.render` handlers can't be `async` | Medium | Confirm SDK's `onPress` callback type. If `onPress: () => void`, use `void` prefix on async calls (fires-and-forgets, same as existing `toggleGuide`). |
| Stale `rememberPrefs: undefined` in existing `paneAtom` state | Low | Falsy default; treated as `false`. No migration needed. |
| `prefsAtom` read adds latency to `session.start` | Low | Two additional `read` calls; both are `$.store` lookups, microseconds. |
| Shape `'prefs-1'` collision with a future story | Low | Record the shape in this analysis as the canonical first use. |

---

## Missing Information

None. The implementation is fully specified from repository evidence.

---

## Recommendation

**GO.** Scope is minimal, risk is low, and the design is consistent with existing patterns. No architectural decision is needed — ADR-004 already covers user-controlled preferences.

Estimated implementation: 3–4 concentrated changes to two files, plus unit tests for the preference restore path.
