# ES-015 — Repository Analysis: Evaluation Signal Reliability

- Story: ES-015
- Date: 2026-11-17
- Branch: `feat/es-011-evaluation-results` (ES-014 HEAD, `f287a73`)
- Status: **Gate 1 — Awaiting Human Approval**

---

## 1. Scope of Analysis

Files inspected:
- `hooks/register.tsx` — full plugin entry point
- `hooks/register.test.ts` — full test suite
- `src/metrics/types.ts` — HistoryEntry and MetricsHistory types
- `src/metrics/normalize.ts` — makeEntry factory
- `types/index.d.ts` — PluginState contract (EvalEntry, EvalLog, PaneSnapshot)
- `docs/architecture/ADR-004-*.md` — compaction intelligence policy
- `docs/architecture/ADR-005-*.md` — evaluation data policy
- `docs/stories/ES-014-*.md` — story, plan, and reports

---

## 2. Confirmed Anomalies

### A1 — `turnsToResumption` measures annotation timing, not tool-use resumption (CRITICAL)

**ADR-005 definition (§3, table):**
> `turnsToResumption` — "Turns after compaction before the first tool-use turn. Collected lazily on the next `turn.complete` event that carries tool usage."

**ES-014 acceptance criterion AC-3:**
> "`turn.complete` fills `turnsToResumption` for the most recent pending entry (first tool-use turn after compaction)"

**Actual implementation (`register.tsx`, line 277–279):**
```typescript
// ES-014: count main-session turns since the last compaction (annotation still pending).
// turnsToResumption is set when the user annotates or dismisses — not here.
if (!isSubagent && prevSnap.pendingAnnotationId != null) {
  await update($, paneAtom, m => ({ ...m, turnsSinceCompaction: m.turnsSinceCompaction + 1 }));
}
```

The comment explicitly states the departure. `turnsToResumption` is populated at annotation click time (`snap.turnsSinceCompaction`), not on first-tool-use detection. AC-3 was not implemented.

**Consequence:** The metric stored in `evalAtom.entries[].turnsToResumption` does not represent "turns until resumption." It represents "turns elapsed between compaction and annotation click." These are distinct. The name misleads any subsequent analysis.

---

### A2 — Dismiss and skip are semantically indistinguishable (CONFIRMED)

**Dismiss handler (`register.tsx`, line 652–654):**
```typescript
<Button onPress={() => {
  void update($, paneAtom, m => ({ ...m, pendingAnnotationId: null })).catch(() => {});
}}>—</Button>
```

The "—" button clears `pendingAnnotationId` but writes nothing to `evalAtom`. The entry remains:
- `userAnnotation: 'skipped'` (default set at compaction time)
- `turnsToResumption: null`

After dismiss, no further `turnsSinceCompaction` increments occur (because `pendingAnnotationId` becomes null). But the entry looks identical to one where:
- A second compaction happened before annotation (annotation window moved)
- The pane was not visible when annotation appeared
- The session ended before annotation

All of these produce `userAnnotation: 'skipped'` with `turnsToResumption: null`. The "—" case — an explicit user decision to skip — is indistinguishable from "annotation never reached."

**Consequence:** Analysis of `skipped` entries conflates explicit dismissal with structural absence. The annotation rate and positive rate calculations in ADR-005 §Go/No-Go criteria are silently distorted.

---

### A3 — Successive compactions leave the first entry with no timing data (CONFIRMED)

When a second `session.compact` fires before the first annotation:
1. A new `evalEntry` is appended to `evalAtom` with a new `compactionId`.
2. `pendingAnnotationId` is overwritten to the new `compactionId`.
3. `turnsSinceCompaction` resets to 0.

The first entry permanently keeps `userAnnotation: 'skipped'` and `turnsToResumption: null`. It is never annotable again (the widget has moved to the second compaction). It is indistinguishable from explicit dismissal (A2 above).

**Consequence:** In sessions with high compaction frequency (e.g., long coding sessions), a large fraction of entries will be unintentionally skipped. These look like "user chose not to annotate" in the data.

---

### A4 — `turnsAtCompaction` and `turnsBeforeCompaction` store the same value (MINOR REDUNDANCY)

`EvalEntry.turnsAtCompaction` (in `evalAtom`) is set to `snap.turns` at compaction time.
`HistoryEntry.turnsBeforeCompaction` (in `historyAtom`) is also set to `snap.turns` at compaction time.

Both values are `snap.turns` from `paneAtom` at the moment of compaction. The intent differs slightly (one is per-entry in `evalAtom`, the other is per-entry in `historyAtom`), but the data is identical. The redundancy is harmless but increases maintenance surface.

---

### A5 — SDK tool-use detection: feasibility not confirmed (TECHNICAL RISK)

ADR-005's intended `turnsToResumption` requires detecting "first tool-use turn" in `turn.complete`. The existing `turn.complete` handler uses only:
- `event.usage` (token counts)
- `event.agentId` (subagent flag)

There is no `event.toolCalls` or similar property consumed anywhere in the codebase. Whether the SDK's `TurnCompleteEvent` exposes tool use at all is not confirmed from the existing code.

**Consequence:** Implementing the original ADR-005 metric may not be technically feasible with the current SDK. Any implementation would require runtime validation.

---

## 3. What Is Working Correctly

The following aspects of ES-014 are functionally correct and should be preserved:

| Component | Status |
|---|---|
| `evalAtom` identity, shape, cap | Correct (`eval-1`, 200 entries) |
| `EvalEntry` structure (excluding naming) | Correctly typed |
| `compactionId` format (`sessionId:index`) | Unique within session |
| `wasGuided` accuracy | Correctly reflects actual injection (ANO-001 fix from ES-013) |
| `trigger` recording | Correct |
| `timestampMs` | Correct |
| `turnsAtCompaction` | Correct (snap.turns at compaction) |
| Annotation 👍/👎 flow | Correctly updates entry and clears pending |
| Fail-open on annotation write failure | Correctly silenced |
| `turnsSinceCompaction` counter logic | Correctly counts main-session turns only |
| `paneAtom.pendingAnnotationId` lifecycle | Correctly set/cleared |
| Session start/end reset | Correctly resets `pendingAnnotationId` and `turnsSinceCompaction` |
| Subagent turns excluded from counter | Correct |

---

## 4. Architecture Options

### Option A — Implement ADR-005 as originally specified

Add first-tool-use detection to `turn.complete`. On the first turn carrying tool usage after a compaction, set `turnsToResumption` in the matching `evalAtom` entry.

**Precondition:** The SDK's `TurnCompleteEvent` must expose tool use (e.g., `event.toolCalls`, `event.hasToolUse`, or similar). This is unconfirmed.

**Risks:**
- Technical: SDK may not expose tool use in event (risk of permanent infeasibility).
- Semantic: "first tool use" ≠ "resumption." Workflows with no tool use are penalized. Subagent tool calls must be excluded. Background/diagnostic tools (e.g., `$.session.id()`) might count spuriously.
- Complexity: requires state tracking across multiple `turn.complete` events (has first tool-use been recorded for this compaction?), adding a new boolean or nullable field to `paneAtom`.

**Verdict:** High risk, uncertain feasibility, semantically fragile. Not recommended as primary path.

---

### Option B — Rename and redefine to match what is actually measured (RECOMMENDED)

Rename `turnsToResumption` → `turnsUntilAnnotation`. Fix the dismiss/skip ambiguity by adding `'dismissed'` to `UserAnnotation`. Revise ADR-005 §3 to reflect the corrected model.

**Changes:**
1. `EvalEntry.turnsToResumption` → `EvalEntry.turnsUntilAnnotation: number | null`
2. `UserAnnotation` = `'positive' | 'negative' | 'skipped' | 'dismissed'`
   - `skipped` = no annotation received (widget expired, session ended, second compaction)
   - `dismissed` = user explicitly pressed "—"
3. Dismiss handler updated to write `userAnnotation: 'dismissed'` to `evalAtom`
4. `PaneSnapshot.turnsSinceCompaction` renamed to `PaneSnapshot.turnsUntilAnnotation` (tracking consistent name)
5. `evalAtom` shape bumped to `eval-2` (structure change → wipes pre-ES-015 eval data)
6. ADR-005 revised to remove the `turnsToResumption` M1-proxy claim and define `turnsUntilAnnotation` with accurate semantics

**Analytical value of `turnsUntilAnnotation`:**
- Annotation timing is a weak proxy for compaction salience: users who experienced continuity loss might annotate sooner (or immediately).
- Guided vs. unguided `turnsUntilAnnotation` distributions offer a secondary comparison signal.
- Explicit: it measures when the user decided, not when work resumed.

**Verdict:** Moderate complexity, low risk, honest semantics. Recommended.

---

### Option C — Remove the timing signal

Remove `turnsToResumption` entirely. Keep: `wasGuided`, `trigger`, `timestampMs`, `turnsAtCompaction`, `userAnnotation` (with dismissed fix).

**Verdict:** Simplest and most defensible. Loses the timing dimension entirely. Appropriate only if Option B's timing signal is judged to have zero analytical value.

---

## 5. Recommendation

**Implement Option B.**

Rationale:
1. The current `turnsSinceCompaction` counter is already implemented and correct. The only problem is the name and the dismiss/skip conflation.
2. Renaming to `turnsUntilAnnotation` is an honest description of what is measured.
3. Adding `'dismissed'` to `UserAnnotation` fixes the ambiguity at low cost.
4. This preserves a timing signal with weak but real analytical value (annotation promptness as proxy for compaction disruption visibility).
5. No new SDK features required.
6. The change requires a shape bump (`eval-2`), which is the correct migration path.

Option A is not recommended because the core SDK capability (tool-use exposure in `turn.complete`) is unconfirmed and the semantic gap remains large. Option C is acceptable if the annotation timing is judged worthless, but this analysis suggests it has marginal value and is cheap to keep.

---

## 6. Required ADR-005 Revision

ADR-005 §3 must be amended:

| Field | Current (ADR-005) | Proposed (ES-015) |
|---|---|---|
| `turnsToResumption` | "Turns after compaction before the first tool-use turn" | **Removed** |
| `turnsUntilAnnotation` | — | "Turns elapsed between compaction and user annotation click. Null when annotation was not provided (skipped or dismissed)." |
| `userAnnotation` | `positive / negative / skipped` | `positive / negative / skipped / dismissed` |

The M1 proxy claim ("Automated equivalent of M1 — Resumption turns") must be removed. `turnsUntilAnnotation` is an annotation timing signal, not a resumption proxy.

The Go/No-Go criteria should not reference `turnsToResumption`. The revised criteria are:
- `userAnnotation` positive rate ≥ 60% in guided group, based on ≥5 annotated events (positive + negative + dismissed, excluding skipped)
- `turnsUntilAnnotation` distributions are supplementary context, not a go/no-go gate

---

## 7. Required Implementation (after approval)

| Item | Scope | File |
|---|---|---|
| Rename `turnsToResumption` → `turnsUntilAnnotation` in `EvalEntry` | types | `types/index.d.ts` |
| Rename `turnsToResumption` → `turnsUntilAnnotation` in all usages | impl | `hooks/register.tsx` |
| Add `'dismissed'` to `UserAnnotation` | types | `types/index.d.ts` |
| Dismiss button writes `userAnnotation: 'dismissed'` | impl | `hooks/register.tsx` |
| Rename `turnsSinceCompaction` → `turnsUntilAnnotation` in `PaneSnapshot` | types | `types/index.d.ts` |
| Rename `turnsSinceCompaction` → `turnsUntilAnnotation` in all usages | impl | `hooks/register.tsx` |
| Bump `evalAtom` shape from `eval-1` → `eval-2` | impl | `hooks/register.tsx` |
| Bump `paneAtom` shape from `pane-4` → `pane-5` | impl | `hooks/register.tsx` |
| Update `PluginState` comment | types | `types/index.d.ts` |
| Update ADR-005 | docs | `docs/architecture/ADR-005-*.md` |
| Add ES-015 regression tests | tests | `hooks/register.test.ts` |
| Update `docs/roadmap.md` | docs | `docs/roadmap.md` |

---

## 8. Out of Scope (confirmed)

- SDK tool-use detection (Option A rejected)
- New compaction triggers
- LLM calls or network
- Reading conversation content
- Dashboard/reporting UI
- Modifying guidance template
- ES-011 Go/No-Go verdict (blocked on data accumulation)
