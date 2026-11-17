# ES-014 — Implementation Report

- Story: `docs/stories/ES-014-evaluation-data-collection.md`
- Plan: `docs/stories/ES-014-implementation-plan.md` ✅ Approved 2026-11-17
- Date: 2026-11-17
- Version: v1.0.3

---

## What Was Built

### Step 1–2 — Types (types/index.d.ts, src/metrics/types.ts)

Added three new exported types to `types/index.d.ts`:
- `UserAnnotation = 'positive' | 'negative' | 'skipped'`
- `EvalEntry` — per-compaction evaluation record with `compactionId`, `wasGuided`, `trigger`, `timestampMs`, `turnsAtCompaction`, `turnsToResumption: number | null`, `userAnnotation`
- `EvalLog = { entries: EvalEntry[]; maxEntries: number }`

Extended `HistoryEntry` with two optional compact-kind fields:
- `turnsBeforeCompaction?: number`
- `contextPercentAtCompaction?: number | null`

Extended `PaneSnapshot` with:
- `pendingAnnotationId: string | null` — annotation state flows through pane to avoid extra atom reads in `ui.render`

Added `eval: Shaped<EvalLog>` to `PluginState`.

Both `HistoryEntry` changes mirrored in `src/metrics/types.ts`.

### Step 3 — normalize.ts

Extended `MakeEntryParams` with `turnsBeforeCompaction?: number` and `contextPercentAtCompaction?: number | null`. Both propagated unconditionally in `makeEntry` return (undefined on non-compact entries — same pattern as `wasGuided`).

### Step 4 — evalAtom + PaneSnapshot initial value

New atom declared after `historyAtom`:
```typescript
const evalAtom = atom(
  { plugin: 'context-optimizer', key: 'eval' } as const,
  { entries: [], maxEntries: 200 } satisfies EvalLog,
  { shape: 'eval-1' },
);
```

`pendingAnnotationId: null` added to `paneAtom` initial value and to both reset paths in `session.start` and `session.end`.

### Step 5 — session.compact extension

After the `historyAtom` update, still inside the existing try block:
1. Computes `compactionId = sessionId + ':' + (compactionCount + 1)` (1-indexed, matches the count after this compaction).
2. Appends `EvalEntry` to `evalAtom` using the same bounded-append pattern as `historyAtom`.
3. Sets `paneAtom.pendingAnnotationId = compactionId`.
4. `makeEntry` now receives `turnsBeforeCompaction: snap.turns` and `contextPercentAtCompaction: snap.context?.percent ?? null`.

All new code is inside the existing try block — a failure is caught and logged by the existing catch.

### Step 6 — turn.complete extension

After the `historyAtom` update, inside the existing try block:
```typescript
if (!isSubagent && prevSnap.pendingAnnotationId != null) {
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

`turnsToResumption = 1` is always correct: this handler fires on the first main-session turn after the compaction, which is definitionally turn #1 of the new window.

### Step 7 — Annotation widget

New pane section renders when `snap.pendingAnnotationId != null`. Three buttons:
- 👍 — sets `userAnnotation: 'positive'` on matching `evalAtom` entry; clears `pendingAnnotationId`
- 👎 — sets `userAnnotation: 'negative'`; clears `pendingAnnotationId`
- — (dismiss) — clears `pendingAnnotationId` only; `userAnnotation` stays `'skipped'`

All atom writes in `onPress` are fire-and-forget with `.catch(() => {})`. A write failure does not affect pane rendering.

### Step 8 — Tests

12 new tests added to `hooks/register.test.ts`:
- `makeEntry` compact fields propagation (2 tests)
- `evalEntry` defaults (1)
- `compactionId` format (1)
- `turnsToResumption` main-session fill (1)
- `turnsToResumption` subagent skip (1)
- Annotation: positive, negative, dismiss (3)
- `evalLog` cap (1)
- `evalAtom` initial state (1)
- `paneAtom` default `pendingAnnotationId` (1)

### Step 9 — ADR-005 + documentation

- `docs/architecture/ADR-005-evaluation-data-policy.md`: `Proposed` → `Accepted`
- `AGENTS.md`: version v1.0.2 → v1.0.3; Current Work updated
- `docs/roadmap.md`: ES-011 evaluation note updated; ES-013 completed; ADR-005 and ES-014 added
- `.claude-plugin/plugin.json`: version 1.0.2 → 1.0.3

---

## Acceptance Criteria Verification

| AC | Status | Evidence |
|---|---|---|
| AC-1 `evalAtom` shape `eval-1`, cap 200 | ✅ | `hooks/register.tsx` atom declaration with `satisfies EvalLog` |
| AC-2 compact entry with defaults | ✅ | `evalEntry defaults` test; `session.compact` code path |
| AC-3 `turnsToResumption` filled lazily | ✅ | `turnsToResumption: first main-session turn` test |
| AC-4 annotation widget | ✅ | `annotation: positive/negative/dismiss` tests; `ui.render` JSX |
| AC-5 annotation fail-open | ✅ | `.catch(() => {})` on all `onPress` writes; `annotation: dismiss` test |
| AC-6 HistoryEntry compact fields | ✅ | `makeEntry: turnsBeforeCompaction propagated` test |
| AC-7 `PluginState.eval` | ✅ | TypeScript compiles (implicit in test run) |
| AC-8 TypeScript | ✅ | 173/173 pass — zero errors |
| AC-9 All tests pass | ✅ | 173/173 pass (`claude plugin test .`) |
| AC-10 ADR-005 Accepted | ✅ | ADR-005 status line updated |

---

## Quality Validation

**Command:** `/home/ludo/.config/Claude/claude-code/2.1.325/00b1b977bcc3/claude plugin test .`

| Metric | Result |
|---|---|
| Total tests | **173** (161 existing + 12 new) |
| Pass | **173** |
| Fail | **0** |
| Files | 10 |
| Duration | 0.51s |

---

## Documentation Update

| File | Change | Reason |
|---|---|---|
| `docs/architecture/ADR-005-evaluation-data-policy.md` | `Proposed` → `Accepted` | Implementation complete |
| `AGENTS.md` | Version, Current Work | ES-014 in progress |
| `docs/roadmap.md` | Phase 3 entries, evaluation note | ADR-005 supersedes manual protocol; ES-013 completed |
| `.claude-plugin/plugin.json` | Version 1.0.2 → 1.0.3 | Standard per-story bump |

**Documentation update: Moderate — version corrections and accuracy improvements.**

---

## Vault Outcome

Vault was not consulted. This is a pure infrastructure story (data collection plumbing) with no cross-project architectural content warranting vault consultation.

**Vault outcome: No action.**

---

## Modified Files

| File | Change |
|---|---|
| `types/index.d.ts` | +27 lines — `EvalEntry`, `EvalLog`, `UserAnnotation`; `HistoryEntry` +2 optional fields; `PaneSnapshot` +1 field; `PluginState` +1 key |
| `src/metrics/types.ts` | +3 lines — `HistoryEntry` mirror |
| `src/metrics/normalize.ts` | +4 lines — `MakeEntryParams` +2 fields; `makeEntry` propagation |
| `hooks/register.tsx` | +70 lines — `evalAtom`; pane reset paths; `session.compact` eval append; `turn.complete` lazy fill; annotation widget |
| `hooks/register.test.ts` | +175 lines — 12 new tests |
| `docs/architecture/ADR-005-evaluation-data-policy.md` | Status update |
| `AGENTS.md` | Version, Current Work |
| `docs/roadmap.md` | Phase 3 entries |
| `.claude-plugin/plugin.json` | Version bump |

New story artifacts:
- `docs/stories/ES-014-evaluation-data-collection.md`
- `docs/stories/ES-014-repository-analysis.md`
- `docs/stories/ES-014-implementation-plan.md`
- `docs/stories/ES-014-implementation-report.md` (this file)
