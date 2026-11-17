# ES-014 — Implementation Plan

- Story: `docs/stories/ES-014-evaluation-data-collection.md`
- Repository Analysis: `docs/stories/ES-014-repository-analysis.md` ✅ Approved 2026-11-17
- Status: **Ready for Gate 2 Approval**
- Date: 2026-11-17

---

## Overview

5 files, all additive. No breaking changes to existing atoms or types. All new code is fail-open.

Execution order: types first → normalize → history → register → pane → tests.

---

## Step 1 — New types (types/index.d.ts)

Add three new exported types:

```typescript
export type UserAnnotation = 'positive' | 'negative' | 'skipped';

export type EvalEntry = {
  compactionId: string;         // sessionId + ':' + compactionIndex (1-indexed)
  wasGuided: boolean;
  trigger: string;
  timestampMs: number;
  turnsAtCompaction: number;    // paneAtom.turns at the moment of compaction
  turnsToResumption: number | null; // set lazily on first main-session turn.complete after compaction
  userAnnotation: UserAnnotation;
};

export type EvalLog = {
  entries: EvalEntry[];
  maxEntries: number;
};
```

Extend `HistoryEntry` with two optional fields (compact-kind only):

```typescript
  turnsBeforeCompaction?: number;
  contextPercentAtCompaction?: number | null;
```

Extend `PaneSnapshot` with one optional field:

```typescript
  /** ES-014: compactionId of the most recent compaction awaiting annotation. Null when none pending. */
  pendingAnnotationId: string | null;
```

Add `eval` key to `PluginState`:

```typescript
  eval: Shaped<EvalLog>;
```

---

## Step 2 — Mirror HistoryEntry extension (src/metrics/types.ts)

Add the same two optional fields to the internal `HistoryEntry` type (this file is the source of truth for internal use; `types/index.d.ts` mirrors it for the PluginState contract):

```typescript
  turnsBeforeCompaction?: number;
  contextPercentAtCompaction?: number | null;
```

---

## Step 3 — Extend MakeEntryParams + makeEntry (src/metrics/normalize.ts)

Add to `MakeEntryParams`:
```typescript
  turnsBeforeCompaction?: number;
  contextPercentAtCompaction?: number | null;
```

Propagate in `makeEntry` return:
```typescript
  turnsBeforeCompaction: params.turnsBeforeCompaction,
  contextPercentAtCompaction: params.contextPercentAtCompaction,
```

---

## Step 4 — evalAtom + PaneSnapshot initial state (hooks/register.tsx)

**4a — Import types:**
```typescript
import type { EvalLog, EvalEntry } from '../types';
```

**4b — New atom after the existing atoms:**
```typescript
// Bounded evaluation log — one entry per compaction event.
// turnsToResumption filled lazily on the first main-session turn.complete after compaction.
// userAnnotation set by in-pane user action; default is 'skipped'.
const evalAtom = atom(
  { plugin: 'context-optimizer', key: 'eval' } as const,
  { entries: [], maxEntries: 200 } satisfies EvalLog,
  { shape: 'eval-1' },
);
```

**4c — PaneSnapshot initial value:**  
Add `pendingAnnotationId: null` to the `paneAtom` initial value (and to both reset paths in `session.start` and `session.end`).

---

## Step 5 — session.compact extension (hooks/register.tsx)

Inside the post-compaction try block, after the `paneAtom` update and `makeEntry` call, add `evalAtom` append and `pendingAnnotationId` set:

```typescript
// ES-014: append eval entry and mark annotation pending.
const compactionIndex = snap.compactionCount + 1; // 1-indexed (count after this compaction)
const compactionId = `${snap.sessionId ?? ''}:${compactionIndex}`;
const evalEntry: EvalEntry = {
  compactionId,
  wasGuided,
  trigger: event.trigger,
  timestampMs: now,
  turnsAtCompaction: snap.turns,
  turnsToResumption: null,
  userAnnotation: 'skipped',
};
await update($, evalAtom, log => {
  const all = [...log.entries, evalEntry];
  const entries = all.length > log.maxEntries ? all.slice(all.length - log.maxEntries) : all;
  return { ...log, entries };
});
await update($, paneAtom, m => ({ ...m, pendingAnnotationId: compactionId }));
```

Also pass the new compact fields to `makeEntry`:
```typescript
turnsBeforeCompaction: snap.turns,
contextPercentAtCompaction: snap.context?.percent ?? null,
```

All new code is inside the existing try block — a failure is caught by the existing `catch { $.ui.status('ctx:err') }`.

---

## Step 6 — turn.complete extension (hooks/register.tsx)

After the `paneAtom` update, still inside the try block, add:

```typescript
// ES-014: fill turnsToResumption for the first main-session turn after a compaction.
if (!isSubagent && prevSnap.pendingAnnotationId !== null && prevSnap.pendingAnnotationId !== undefined) {
  const pendingId = prevSnap.pendingAnnotationId;
  await update($, evalAtom, log => ({
    ...log,
    entries: log.entries.map(e =>
      e.compactionId === pendingId && e.turnsToResumption === null
        ? { ...e, turnsToResumption: 1 }
        : e
    ),
  }));
  await update($, paneAtom, m => ({ ...m, pendingAnnotationId: null }));
}
```

`prevSnap` is already read before the update at line 236. `turnsToResumption = 1` because this is definitionally the first main-session turn after the compaction.

---

## Step 7 — Annotation widget (hooks/register.tsx — ui.render)

Add a new section at the bottom of the pane, after the Compaction Guidance section, before the performance section:

```tsx
{/* ES-014: Annotation widget — shown when a compaction just occurred and annotation is pending */}
{snap.pendingAnnotationId !== null && snap.pendingAnnotationId !== undefined && (
  <Box flexDirection="column">
    <Text bold>Last compaction</Text>
    <Box flexDirection="row">
      <Text dimColor>  Summary useful?  </Text>
      <Button onPress={() => {
        const id = snap.pendingAnnotationId!;
        void update($, evalAtom, log => ({
          ...log,
          entries: log.entries.map(e =>
            e.compactionId === id ? { ...e, userAnnotation: 'positive' as const } : e
          ),
        })).catch(() => {});
        void update($, paneAtom, m => ({ ...m, pendingAnnotationId: null })).catch(() => {});
      }}>👍</Button>
      <Text>  </Text>
      <Button onPress={() => {
        const id = snap.pendingAnnotationId!;
        void update($, evalAtom, log => ({
          ...log,
          entries: log.entries.map(e =>
            e.compactionId === id ? { ...e, userAnnotation: 'negative' as const } : e
          ),
        })).catch(() => {});
        void update($, paneAtom, m => ({ ...m, pendingAnnotationId: null })).catch(() => {});
      }}>👎</Button>
      <Text>  </Text>
      <Button onPress={() => {
        void update($, paneAtom, m => ({ ...m, pendingAnnotationId: null })).catch(() => {});
      }}>—</Button>
    </Box>
    <Text dimColor>  eval: {(() => { try { return 'collecting'; } catch { return '?'; } })()}</Text>
  </Box>
)}
```

The `evalAtom` is not read in `ui.render` — annotation state flows through `paneAtom.pendingAnnotationId` to avoid the extra atom read on every render cycle. All atom writes inside `onPress` are fire-and-forget with `.catch(() => {})` (fail-open).

---

## Step 8 — Tests

New tests in `hooks/register.test.ts` (or a new `hooks/register.eval.test.ts` if length warrants):

| Test | Description |
|---|---|
| `evalEntry defaults` | New `EvalEntry` has correct defaults: `turnsToResumption: null`, `userAnnotation: 'skipped'` |
| `compactionId format` | `compactionId = sessionId + ':' + index`, 1-indexed |
| `turnsToResumption = 1` | After compact, first main-session turn sets `turnsToResumption` to `1` |
| `subagent turns skipped` | A subagent turn does NOT fill `turnsToResumption` |
| `annotation: positive` | `userAnnotation` updated to `'positive'` on 👍 |
| `annotation: negative` | `userAnnotation` updated to `'negative'` on 👎 |
| `annotation: dismiss` | `pendingAnnotationId` cleared on `—`, `userAnnotation` stays `'skipped'` |
| `evalLog cap` | Log capped at `maxEntries`; oldest dropped when full |
| `pendingAnnotationId cleared` | After `turn.complete` fills `turnsToResumption`, `pendingAnnotationId` is `null` |
| `makeEntry: compact fields` | `turnsBeforeCompaction` and `contextPercentAtCompaction` propagated |
| `HistoryEntry: optional fields` | Compact entry has `turnsBeforeCompaction`/`contextPercentAtCompaction`; turn entry does not |
| `EvalLog initial state` | `evalAtom` default: `{ entries: [], maxEntries: 200 }` |

---

## Step 9 — ADR-005 status update

Change `docs/architecture/ADR-005-evaluation-data-policy.md` line 3:
```
- Status: **Proposed**
```
→
```
- Status: **Accepted**
```

---

## Acceptance Criteria Verification Plan

| AC | Verification |
|---|---|
| AC-1 `evalAtom` | Inspect atom declaration and `EvalLog` satisfies check |
| AC-2 compact append | Unit test: compact event → evalAtom entry with correct defaults |
| AC-3 `turnsToResumption` | Unit test: first main-session turn → fills `turnsToResumption: 1` |
| AC-4 annotation widget | Unit test: annotation buttons update `userAnnotation` and clear `pendingAnnotationId` |
| AC-5 annotation fail-open | Unit test: evalAtom write throws → pane renders normally |
| AC-6 HistoryEntry compact fields | Unit test: `makeEntry` propagates both fields |
| AC-7 `PluginState.eval` | TypeScript compile (implicit in `claude plugin test .`) |
| AC-8 TypeScript | `claude plugin test .` — zero errors |
| AC-9 All tests pass | `claude plugin test .` |
| AC-10 ADR-005 Accepted | File check after Step 9 |

---

## Out of Scope

- Reporting or export UI for `evalAtom` data
- ES-011 Go/No-Go verdict
- MRV-001–005 from ES-013

---

## Version

v1.0.3 — `eval-1` atom, annotation widget, compact history fields.
