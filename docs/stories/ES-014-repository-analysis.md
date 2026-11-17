# ES-014 — Repository Analysis

- Story: `docs/stories/ES-014-evaluation-data-collection.md`
- Status: **Ready for Gate 1 Approval**
- Date: 2026-11-17
- Analyst: Claude (Sonnet 4.6)

---

## Objective

Understand the existing atom infrastructure, HistoryEntry structure, `turn.complete` handler, pane rendering, and PluginState contract to implement ADR-005 — specifically: `evalAtom`, `turnsToResumption` lazy collection, and the in-pane annotation widget.

---

## DevLog Context

DEVLOG_CONTEXT_ERROR: MCP timeout on initial call. Analysis continues from direct repository inspection. The repository state is authoritative.

---

## Repository State

**Current branch:** `feat/es-011-evaluation-results` (worktree)
**Version:** v1.0.2 (ES-013 merged, `ad7bada`)
**Tests:** 161/161 pass (`claude plugin test .`)

---

## Atom Infrastructure Analysis

### Existing atoms (hooks/register.tsx)

| Atom | Key | Shape | Type | Cap | Purpose |
|---|---|---|---|---|---|
| `_legacyMetricsCompat` | `metrics` | `compat-clear-1` | `null` | n/a | Migration shim, never read/written |
| `paneAtom` | `pane` | `pane-3` | `PaneSnapshot` | 1 | Live display state |
| `prefsAtom` | `prefs` | `prefs-1` | `{rememberPrefs, guideEnabled}` | 1 | Persistent user preferences |
| `historyAtom` | `history` | `history-1` | `MetricsHistory` | MAX_HISTORY (100) | Bounded session history |

**New atom needed:** `evalAtom` with key `eval`, shape `eval-1`, type `EvalLog` (array of `EvalEntry`), cap 200.

The bounded-append-only pattern used by `historyAtom` is straightforward: `appendEntry` slices to `maxEntries` after each append. `evalAtom` will use the same pattern with its own cap.

### PluginState (types/index.d.ts)

Currently has 4 keys: `history`, `pane`, `metrics` (migration shim), `prefs`. Needs `eval` added.

---

## HistoryEntry Analysis (src/metrics/types.ts, src/metrics/normalize.ts)

Current compact-kind fields:
- `compactTrigger: string | null`
- `wasGuided?: boolean`

ADR-005 requires adding to compact entries:
- `turnsBeforeCompaction: number` — count of main-session turns in `paneAtom.turns` at the moment of compaction (before reset/null)
- `contextPercentAtCompaction: number | null` — `snap.context?.percent ?? null` at the moment of compaction

Both values are already available in `session.compact` at the point where `makeEntry` is called (`snap = await read($, paneAtom)` is already there, line 359–360). No new reads needed.

**MakeEntryParams** must gain `turnsBeforeCompaction?: number` and `contextPercentAtCompaction?: number | null` as optional fields.

---

## turn.complete Handler Analysis (hooks/register.tsx:205–268)

The handler currently:
1. Reads `$.session.usage()` for context snapshot
2. Reads `paneAtom` to get `sessionId`
3. Updates `paneAtom` (increments `turns` for main-session turns; `isSubagent` check at line 232–233)
4. Appends a `HistoryEntry` of kind `'turn'`
5. Never inspects tool use

For `turnsToResumption` collection, the handler needs to:
1. After each compaction, track "are we waiting for the first tool-use turn"
2. When a turn completes with tool usage, fill the pending `evalAtom` entry

**Key question: how to detect tool usage on a turn?**

The `turn.complete` event's `event.usage` carries token counts but not tool metadata. The SDK does not expose individual tool calls. However, the existing `isSubagent` check uses `event.agentId !== undefined` — subagent turns are themselves caused by tool use in parent turns.

A reliable proxy available without content inspection: **`event.usage !== undefined && event.usage.output_tokens > 0`** does not distinguish tool-use turns from chat turns.

A better proxy: check if the turn is a main-session non-subagent turn. But this still doesn't tell us whether tool calls were made.

**Available SDK fields on `turn.complete` event (from AGENTS.md / SDK):**

Looking at the existing code, `event` on `turn.complete` has:
- `event.usage?: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }`  
- `event.agentId?: string`

There is no `event.toolCalls` or `event.hasToolUse` field visible in the current handler. The plugin SDK may not expose this.

**Fallback approach for `turnsToResumption`:** Count main-session turns after the last compaction (excluding subagent turns). This is simpler and always available via `paneAtom.turns` — the `turns` counter is already only incremented for main-session turns (`!isSubagent`). The turns-since-last-compaction count is derivable as: `paneAtom.turns` at the moment of the first main-session turn post-compaction minus `paneAtom.turns` at the moment of compaction.

**Revised `turnsToResumption` strategy:**
- At compaction time: record `turnsAtCompaction = snap.turns` in the pending `evalAtom` entry.
- On the next `turn.complete` (first main-session turn after compaction): `turnsToResumption = paneAtom.turns - turnsAtCompaction + 1`.
- "First tool-use turn" detection is infeasible without content access; replace with "first main-session turn" as the proxy.

This is consistent with ADR-005's intent (behavioral proxy, not content analysis) and is simpler to implement correctly.

---

## Pane Rendering Analysis (hooks/register.tsx:398–599)

The pane is rendered via `on('ui.render', { component: 'Pane', requestId: PANE }, ...)`. It reads `paneAtom` and `historyAtom` to build the JSX tree. Each section uses `Box`/`Text`/`Button` components from `$.ui.resolve(event)`.

**Annotation widget placement:** A new "Evaluation" section at the bottom of the pane (after the Compaction Guidance section). It renders:
- When `snap.compactionCount > 0` and there's a pending annotation: a prompt "Summary useful? 👍 👎 —"
- When no pending annotation: nothing (or a compact status showing evaluation data count)

The pending-annotation state needs to be surfaced in `paneAtom` (a lightweight flag: `pendingAnnotationId: string | null`). This avoids a second atom read in `ui.render`.

**Alternative:** Read `evalAtom` directly in `ui.render` to find the latest entry with `userAnnotation: 'skipped'`. This is correct but adds an atom read on every render cycle. The `paneAtom.pendingAnnotationId` approach is more efficient.

---

## Implementation Surface

### New type: EvalEntry (types/index.d.ts)

```typescript
export type UserAnnotation = 'positive' | 'negative' | 'skipped';

export type EvalEntry = {
  compactionId: string;         // sessionId + ':' + compactionIndex
  wasGuided: boolean;
  trigger: string;
  timestampMs: number;
  turnsAtCompaction: number;    // paneAtom.turns at compact time (for turnsToResumption calculation)
  turnsToResumption: number | null; // set lazily on first main-session turn.complete
  userAnnotation: UserAnnotation;
};

export type EvalLog = {
  entries: EvalEntry[];
  maxEntries: number;
};
```

### New atom: evalAtom

```typescript
const evalAtom = atom(
  { plugin: 'context-optimizer', key: 'eval' } as const,
  { entries: [], maxEntries: 200 } satisfies EvalLog,
  { shape: 'eval-1' },
);
```

### PaneSnapshot extension

Add `pendingAnnotationId: string | null` to `PaneSnapshot`. No shape bump needed — the new field has a safe default (`null`) and is not a breaking schema change. Actually, adding a field to `PaneSnapshot` requires that the `satisfies PaneSnapshot` check in `paneAtom` initial value includes it — so the initial value must set `pendingAnnotationId: null`. No shape bump is needed because the existing persisted state (shape `pane-3`) doesn't have this field, but `read()` will return the stored object; the missing field will be `undefined` until the pane updates. The handler always spreads `...m` and then sets `pendingAnnotationId`, so old persisted state is handled correctly.

**Wait** — if persisted `paneAtom` state doesn't have `pendingAnnotationId`, then `snap.pendingAnnotationId` will be `undefined` (not `null`) until the first update. The pane renderer must treat both as "no pending annotation". This is safe.

### HistoryEntry extension

Add to `HistoryEntry`:
```typescript
turnsBeforeCompaction?: number;
contextPercentAtCompaction?: number | null;
```
Optional (only on compact-kind entries).

### Changes to session.compact

After `result = await next(eventToPass)`, before the state update:
1. Read `snap.turns` (already read at line 359).
2. Compute `compactionId = \`${snap.sessionId ?? ''}:${snap.compactionCount + 1}\`` (1-indexed).
3. Append `EvalEntry` to `evalAtom` with `turnsToResumption: null`, `userAnnotation: 'skipped'`.
4. Set `paneAtom.pendingAnnotationId = compactionId`.
5. Pass `turnsBeforeCompaction: snap.turns` and `contextPercentAtCompaction: snap.context?.percent ?? null` to `makeEntry`.

### Changes to turn.complete

After the `paneAtom` update, in the try block:
1. Read `snap.pendingAnnotationId` from the **pre-update** snap (already read as `prevSnap`, line 236).
2. If `prevSnap.pendingAnnotationId !== null` and `!isSubagent`:
   - Read `evalAtom`.
   - Find the entry with matching `compactionId`.
   - Compute `turnsToResumption = currentTurns - entry.turnsAtCompaction + 1` (where `currentTurns` is the new `pane.turns` after increment).
   - Update the `evalAtom` entry.
   - Clear `paneAtom.pendingAnnotationId = null`.
3. Fail-open: evalAtom update failure is caught by the existing outer try/catch.

**Note:** `prevSnap` is read at line 236 before the pane update. After the pane update, `pane.turns` is incremented. The correct `turnsToResumption` is `1` (this is the first main-session turn after compaction). Using `1` directly is simpler and equally correct.

### Annotation widget

Three buttons: "👍", "👎", "—". Each `onPress` calls `update($, evalAtom, ...)` to set `userAnnotation` on the matching entry and clears `paneAtom.pendingAnnotationId`. All writes are fire-and-forget with `.catch(() => {})` (fail-open).

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `evalAtom` read in `turn.complete` adds latency | Low | Only when `pendingAnnotationId !== null` (after each compaction, then clears). |
| `pendingAnnotationId` left stale after session end | Low | `session.end` reset path already resets `paneAtom` to initial state; initial value includes `pendingAnnotationId: null`. |
| `compactionId` collision across sessions | Negligible | `sessionId + ':' + index` is unique per session; `evalAtom` persists across sessions and each entry carries its own sessionId. |
| `turnsToResumption = 1` hardcoded is too simplistic | Medium | ADR-005 says "first main-session turn" — that is turn #1, so `1` is always correct. If in future a richer proxy is needed (e.g., first tool-use turn), it's an additive change. |
| PaneSnapshot `pendingAnnotationId` undefined on old persisted state | Low | Renderer treats `undefined` same as `null`. |

---

## Affected Files

| File | Change type |
|---|---|
| `types/index.d.ts` | Add `EvalEntry`, `EvalLog`, `UserAnnotation` types; extend `HistoryEntry`; extend `PaneSnapshot`; add `eval` to `PluginState` |
| `src/metrics/types.ts` | Mirror `HistoryEntry` extension (`turnsBeforeCompaction`, `contextPercentAtCompaction`) |
| `src/metrics/normalize.ts` | Extend `MakeEntryParams` with new compact fields; propagate in `makeEntry` |
| `hooks/register.tsx` | Add `evalAtom`; extend `session.compact` and `turn.complete`; add annotation widget in `ui.render` |
| `docs/architecture/ADR-005-evaluation-data-policy.md` | Status `Proposed` → `Accepted` after implementation |

No changes needed to: `src/advisor/`, `src/guide/`, `src/pane/`, `src/metrics/history.ts`, `src/perf/`.

---

## Missing Information

None. All required SDK surfaces (`atom`, `read`, `update`, `$.ui.resolve`, `$.session.id`) are already in use. The implementation is fully derivable from the current codebase.

---

## Recommendation

**GO.** The implementation is straightforward — additive, fail-open, no breaking changes to existing atoms. The main design decision (`turnsToResumption = 1` vs a lazy counter) is settled above. Gate 2 approval may proceed once Gate 1 is approved.
