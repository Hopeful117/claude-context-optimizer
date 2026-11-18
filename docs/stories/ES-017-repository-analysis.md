# ES-017 — Repository Analysis

- Story: `docs/stories/ES-017-eval-data-display.md`
- Date: 2026-11-18
- Branch: `feat/es-017-eval-data-display`
- Base commit: `cb33442` (ES-015 merged, v1.0.4)

---

## 1. Repository State

| Item | Value |
|---|---|
| Version | v1.0.4 |
| Last commit | `cb33442` — feat(ES-015): evaluation signal reliability |
| Tests | 180 pass, 0 fail |
| TypeScript | 0 errors |
| evalAtom shape | `eval-2` |
| paneAtom shape | `pane-5` |

---

## 2. evalAtom — Current Structure

Defined in `hooks/register.tsx` lines 72–76:

```ts
const evalAtom = atom(
  { plugin: 'context-optimizer', key: 'eval' } as const,
  { entries: [], maxEntries: 200 } satisfies EvalLog,
  { shape: 'eval-2' },
);
```

`EvalLog` and `EvalEntry` types (`types/index.d.ts` lines 11–25):

```ts
export type UserAnnotation = 'positive' | 'negative' | 'skipped' | 'dismissed';

export type EvalEntry = {
  compactionId: string;
  wasGuided: boolean;
  trigger: string;
  timestampMs: number;
  turnsAtCompaction: number;
  turnsUntilAnnotation: number | null;
  userAnnotation: UserAnnotation;
};

export type EvalLog = { entries: EvalEntry[]; maxEntries: number; };
```

**All fields needed for the aggregate display are available.** No schema change required.

---

## 3. ui.render Handler — Current Structure

`hooks/register.tsx` lines 441–686.

The handler:
1. Reads `paneAtom` (line 446) and `historyAtom` (line 447).
2. Does **not** currently read `evalAtom`.
3. Renders sections in order: header → Session Overview → Advisor → Cache → Rate Limits → Cost → Session → Compaction Guidance → annotation widget → Overhead.
4. Wraps the entire render in `try/catch`; on error returns a minimal error box.

**Adding `evalAtom` read:** A third `await read($, evalAtom)` call at the top of the handler is the minimal change. Its failure must be caught independently so the rest of the pane renders normally (ADR-001 fail-open).

Recommended pattern:
```ts
const evalLog = await read($, evalAtom).catch(() => ({ entries: [], maxEntries: 200 }));
```

This is fail-open by construction: a read failure produces an empty log, which renders the section as absent (AC-6 / AC-7).

---

## 4. Computation Logic

The aggregate computation is pure and stateless — it takes an `EvalLog` and returns a summary object. It has no side effects, no atoms, no async. It belongs in a new file `src/pane/eval-summary.ts`, parallel to the existing `src/pane/trend.ts` and `src/pane/format.ts`.

### Inputs

- `EvalLog` (from `evalAtom`)
- `EvalEntry[]` entries

### Processing steps

1. Filter out `precompute` entries: `entries.filter(e => e.trigger !== 'precompute')`
2. Split into Group A (`wasGuided === false`) and Group B (`wasGuided === true`)
3. Per group, count: total, positive, negative, dismissed, skipped
4. Per group, compute: `annotated = positive + negative + dismissed`
5. Per group, compute: `response_rate = annotated / total` (null if total = 0)
6. Per group, compute: `satisfaction_rate = positive / annotated` (null if annotated = 0)

### Output type

```ts
export type GroupStats = {
  total: number;
  positive: number;
  negative: number;
  dismissed: number;
  skipped: number;
  annotated: number;        // positive + negative + dismissed
  responseRate: number | null;    // annotated / total
  satisfactionRate: number | null; // positive / annotated
};

export type EvalSummary = {
  totalEntries: number;         // all entries including precompute
  precomputeExcluded: number;   // precompute count removed
  groupA: GroupStats;           // wasGuided === false
  groupB: GroupStats;           // wasGuided === true
};
```

### Edge cases

- Empty log → `EvalSummary` with all zeros, both rates null. Section hidden (AC-6).
- All entries are `precompute` → both groups empty, section hidden.
- One group has 0 entries → rates null for that group, displayed as "—".
- Division by zero → rate is `null`, rendered as "—".

---

## 5. Pane Section Design

The new section is appended after the annotation widget and before the Overhead section.

**Hidden when:** `evalLog.entries.length === 0`

**Displayed format (illustrative):**

```
Evaluation Data  (14 entries, 2 precompute excluded)
  Unguided (A)   total:8  annotated:5  skipped:3
    response: 5/8=63%   satisfaction: 3/5=60%
    pos:3  neg:2  dis:0
  Guided (B)     total:4  annotated:3  skipped:1
    response: 3/4=75%   satisfaction: 3/3=100%
    pos:3  neg:0  dis:0
```

**Design constraints:**
- Text-only rendering (no new component types). `Box` + `Text` only, consistent with existing pane sections.
- `dimColor` for secondary figures (consistent with rest of pane).
- Rates shown as `N/D=P%` to make absolute counts visible at a glance (per ADR-005 amended ES-016: "reports must show absolute counts").
- Section title uses `bold`, consistent with other section headers.

---

## 6. Test Surface

New file: `src/pane/eval-summary.test.ts`

The `computeEvalSummary` function is a pure function over `EvalEntry[]`. It is straightforwardly unit-testable.

Required test cases:
- Empty log
- All `precompute` → both groups empty
- Single entry, unguided, positive
- Single entry, guided, skipped
- Mixed entries: both groups populated, various annotations
- Precompute excluded from both groups
- Division by zero (0 annotated, 0 total)
- Full cap (200 entries)

No mock required — the function takes plain data.

Existing `hooks/register.test.ts` does not need to change (no new event handler logic, only a new read in the render handler). One integration-style render test should verify the section is absent when evalLog is empty and present otherwise — but render tests in this codebase are limited (the test file focuses on atom state, not JSX output). A render regression test for the section is desirable but not blocking.

---

## 7. Files to Modify / Create

| File | Change |
|---|---|
| `src/pane/eval-summary.ts` | **New** — `computeEvalSummary` pure function + `EvalSummary`, `GroupStats` types |
| `src/pane/eval-summary.test.ts` | **New** — unit tests for `computeEvalSummary` |
| `hooks/register.tsx` | **Modify** — read `evalAtom` in `ui.render`; render "Evaluation Data" section |

No changes to:
- `types/index.d.ts` — no new public types (EvalSummary / GroupStats are internal to `src/pane/`)
- `src/metrics/` — no metrics changes
- `src/advisor/` — no advisor changes
- `src/guide/` — no guide changes
- Any atom definitions or event handlers

---

## 8. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| `evalAtom` read adds latency to render | Low — read is fast (bounded 200-entry array) | `.catch(() => fallback)` pattern; no structural change to render path |
| Pane becomes too long | Low — section is compact (5 lines of text per group) | Section hidden when empty; already a long pane |
| `EvalSummary` types leak into `types/index.d.ts` | Low — intentionally kept in `src/pane/` | Types are internal; `PluginState` contract unchanged |

---

## 9. Conclusion

The scope is well-contained:

- One new pure-function module with full unit tests.
- One `await read($, evalAtom).catch(...)` added to the render handler.
- One new JSX section (text-only, fail-open).
- No new atoms, no schema changes, no new event handlers.

The change is low-risk, high-value: it replaces manual count tracking during the evaluation period with an always-current display.
