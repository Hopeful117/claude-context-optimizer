# ADR-005 — Evaluation Data Policy

- Status: **Accepted** *(amended 2026-11-17 by ES-015 — see §Amendment below)*
- Date: 2026-11-17
- Supersedes: ES-011 manual A/B evaluation protocol (qualitative M1–M4)
- Related: ADR-002 (privacy), ADR-003 (advisory-first), ADR-004 (compaction intelligence)

---

## Context

ES-011 defined a manual comparative evaluation protocol (Group A vs B, metrics M1–M4 recorded by hand). This approach has three structural problems:

1. **No traceability.** Observations recorded in a markdown file have no link to the actual session event that produced them. There is no way to verify, replay, or audit them.
2. **Human error.** M1 (resumption turns) and M2 (corrections needed) require counting turns in real time during active work. The measurement interferes with the activity being measured.
3. **Scalability.** The plugin is designed for sustained use across many sessions. A protocol that requires manual recording after each compaction is incompatible with long-term evidence accumulation.

ADR-003 §4 explicitly requires that recommendations be evaluated on comparable work. That evaluation obligation cannot be met with manually recorded, non-auditable data.

The plugin already persists structured history entries in `historyAtom` (bounded ring-buffer, `$.store`). The right lever is to extend what is already automatically collected rather than introduce a parallel manual process.

---

## Decision

### 1. Automatic collection only

All evaluation data is collected automatically at event time. No manual recording workflow is required or supported.

### 2. Behavioral proxies, not content analysis

The plugin must never read, store, or analyze conversation content, tool output bodies, or compaction summaries. Quality is inferred from observable behavioral signals only.

This is consistent with ADR-002 (no prompt bodies or tool output bodies) and ADR-003 (no LLM calls for baseline analysis).

### 3. Persisted evaluation signals

The following signals are collected automatically on each `session.compact` event and stored in `historyAtom` as part of the compaction `HistoryEntry`:

| Signal | Type | Description |
|---|---|---|
| `wasGuided` | `boolean` | Already present (ES-013). True when PRESERVATION_TEMPLATE was injected. |
| `turnsBeforeCompaction` | `number` | Main-session turn count in the current compaction window (since last compaction or session start). Proxy for session depth at compaction time. |
| `contextPercentAtCompaction` | `number \| null` | Context fill % at the moment of compaction. Already available from pane state. |

The following signal is collected in a new dedicated `evalAtom` (shape `eval-2`), appended per compaction event:

| Signal | Type | Description |
|---|---|---|
| `compactionId` | `string` | Stable per-event identifier (`sessionId + compactionIndex`). Links pre- and post-compaction observations. |
| `turnsUntilAnnotation` | `number \| null` | Turns elapsed between compaction and the user's annotation click (👍 or 👎). Null when annotation was not provided (entry is `skipped` or `dismissed`). Measures annotation promptness, not work resumption. |
| `wasGuided` | `boolean` | Copied from the compact event for independent access. |
| `trigger` | `string` | Copied from `event.trigger`. |
| `timestampMs` | `number` | For temporal analysis. |

### 4. Optional lightweight user annotation

A per-compaction annotation is available but never required. After each compaction, the pane shows a one-line prompt:

> *Summary useful?* `👍` `👎` `—`

The user's choice is appended to the matching `evalAtom` entry by `compactionId`. The enum has four values:

| Value | Meaning |
|---|---|
| `positive` | User rated the compaction summary useful (👍) |
| `negative` | User rated the compaction summary not useful (👎) |
| `dismissed` | User explicitly declined to rate (—) |
| `skipped` | No annotation received (second compaction happened, pane not visible, session ended) |

Default at compaction time is `skipped`. Clicking "—" writes `dismissed` — this distinguishes an explicit non-answer from structural absence.

This satisfies the need for a subjective quality signal without mandating a recording workflow. It is the only manual input in the evaluation pipeline.

### 5. Analysis from persisted data

Evaluation conclusions are drawn from `evalAtom` contents at analysis time — not from real-time observation. The dataset can be inspected, exported, and re-analyzed at any point without re-running sessions.

The Go/No-Go criteria from ES-011 are reformulated in terms of these signals:

| Original metric | Automated equivalent | Signal |
|---|---|---|
| M1 — Resumption turns | Not automatable without content analysis — deferred | `turnsUntilAnnotation` as supplementary context only (annotation promptness proxy) |
| M2 — Corrections needed | Cannot be automated without content analysis — deferred | User annotation as indirect proxy |
| M3 — Key decisions preserved | Cannot be automated without content analysis — user annotation | `evalAtom.userAnnotation` |
| M4 — Files preserved | Cannot be automated without content analysis — user annotation | `evalAtom.userAnnotation` |

**Note:** `turnsUntilAnnotation` measures when the user chose to annotate, not when work resumed. It is a supplementary signal — annotation promptness may correlate with how disruptive the compaction felt — but it is not a direct proxy for M1 and must not be used as a go/no-go gate on its own.

**Comparative Go/No-Go criteria** *(amended ES-016 — see §Amendment-2 below)*:

| Outcome | Criteria |
|---|---|
| GO | Group B `satisfaction_rate` > Group A `satisfaction_rate` AND Group B `satisfaction_rate` ≥ 50%, based on ≥5 annotated events (positive + negative + dismissed, excluding skipped and precompute) per group, with comparable trigger distributions |
| CONDITIONAL GO | Results trend positive for Group B but: sample < 5 per group, OR groups not comparable (trigger distribution differs > 40pp), OR `response_rate` < 40% in either group, OR observations contradictory |
| NO-GO | Group B `satisfaction_rate` ≤ Group A `satisfaction_rate` after ≥10 annotated events per group, with comparable samples |
| INSUFFICIENT EVIDENCE | Fewer than 5 annotated events in either group, OR `response_rate` < 20% in either group, OR trigger distributions incompatible for comparison |

**Metric definitions:**

| Metric | Formula | Notes |
|---|---|---|
| `response_rate` | `(positive + negative + dismissed) / total_entries` | Measures dataset participation quality |
| `satisfaction_rate` | `positive / (positive + negative + dismissed)` | Primary comparative metric |
| `dismissal_rate` | `dismissed / (positive + negative + dismissed)` | Annotation fatigue indicator — not a negative signal |
| `missing_rate` | `skipped / total_entries` | Structural absence — not a negative signal |

**Confidence qualifiers:**

| Confidence | Condition |
|---|---|
| Exploratory | ≥5 and < 15 annotated events per group |
| Indicative | ≥15 annotated events per group, comparable triggers |
| Not assessable | INSUFFICIENT EVIDENCE state |

**Precompute exclusion:** All `precompute` entries must be excluded from both groups before computing rates. `precompute` can never be guided (ADR-004 §Trigger policy), so its entries always fall in Group A and skew comparability.

**Thresholds are directional estimates for the prototype phase, not statistically validated significance levels.** A GO at Exploratory confidence (< 15 events/group) is a directional signal — it does not constitute proof of superiority. Only `positive`, `negative`, and `dismissed` entries count toward the annotation sample; `skipped` entries are excluded from rate calculations. Reports must show absolute counts alongside percentages.

### 6. Privacy invariants (ADR-002 compatibility)

- `turnsBeforeCompaction` and `turnsUntilAnnotation` are turn counts — integers. No content.
- `contextPercentAtCompaction` is a percentage — no content.
- `userAnnotation` is a four-state enum — no content.
- `compactionId` is derived from session ID and an index — no content.
- No compaction summary text, no message text, no file contents are stored.

### 7. Atom discipline (ADR-001 §Atom discipline)

`evalAtom` has a stable identity `{ plugin: 'context-optimizer', key: 'eval' }` with shape `eval-2` (bumped from `eval-1` by ES-015 to clear mislabeled data). It is a bounded append-only log (cap: 200 entries, same mechanism as `historyAtom`). `PluginState` must be updated to include the `eval` key.

---

## Consequences

- ES-011 manual protocol (`docs/investigations/ES-011-comparative-evaluation-protocol.md`) is superseded. The results template created in the same session is obsolete.
- ES-014 implements `evalAtom`, annotation widget, and `turnsUntilAnnotation` counter.
- ES-015 corrects the signal naming and disambiguation (see §Amendment).
- `HistoryEntry` gains `turnsBeforeCompaction` and `contextPercentAtCompaction` on compact entries. `MakeEntryParams` must be extended accordingly.
- The in-pane annotation widget must be fail-open: if the atom write fails, the pane continues rendering normally.

---

## Alternatives Considered

**Keep the manual protocol (ES-011 M1–M4).**
Rejected — no traceability, error-prone, incompatible with long-term use.

**Analyze compaction summary content.**
Rejected — violates ADR-002. Summary text is conversation content.

**Use an LLM to score compaction quality.**
Rejected — violates ADR-003. No LLM calls for analysis.

**Instrument Claude Code's summarizer directly.**
Not available — the summarizer is not exposed through the plugin SDK. Confirmed by ES-009.

**Mandatory post-compaction annotation (required, not optional).**
Rejected — annotation fatigue degrades data quality over time. Optional annotation with `skipped` default preserves signal without imposing overhead.

---

## Amendment — ES-015 (2026-11-17)

**Problem identified in ES-015 repository analysis:**

The ES-014 implementation of `turnsToResumption` does not match the specification in this ADR.

ADR-005 §3 specified: *"Turns after compaction before the first tool-use turn. Collected lazily on the next `turn.complete` event that carries tool usage."*

The actual ES-014 implementation counts turns from compaction to annotation click, not to first tool use. The comment in `register.tsx` even acknowledges this: *"turnsToResumption is set when the user annotates or dismisses — not here."* AC-3 from ES-014 (lazy collection on first tool-use turn) was not implemented.

Additionally, the `'skipped'` annotation value was used for both explicit dismissal and structural absence (annotation never reached), making the two indistinguishable in analysis.

**Changes made by ES-015:**

1. `turnsToResumption` → `turnsUntilAnnotation` (accurate description of what is measured)
2. `UserAnnotation` gains `'dismissed'` for explicit "—" press; `'skipped'` is reserved for structural absence
3. `evalAtom` shape bumped `eval-1` → `eval-2` to clear mislabeled entries
4. `paneAtom` shape bumped `pane-4` → `pane-5` to clear renamed field
5. Go/No-Go criteria revised: `turnsToResumption` removed as gate; annotation positive rate is the primary criterion

**Why not implement original ADR-005 M1 proxy:**

First-tool-use detection in `turn.complete` was investigated. The SDK's `TurnCompleteEvent` does not expose tool use at the event level (confirmed by codebase inspection: only `event.usage` and `event.agentId` are consumed). Implementing the original metric would require unconfirmed SDK capability and remains semantically fragile (first tool use ≠ work resumption; workflows with no tool use are penalized).

---

## Amendment — ES-016 (2026-11-18)

**Problem identified in ES-016 repository analysis:**

The Go/No-Go criteria introduced by ADR-005 and revised by ES-015 apply an absolute satisfaction threshold (60%) to the guided group only. This is insufficient to demonstrate comparative improvement: the unguided group could achieve a higher satisfaction rate while the guided group still meets the threshold, producing a spurious GO verdict.

Three additional gaps were identified:

1. **No `INSUFFICIENT EVIDENCE` state.** The three-outcome grid forced a premature verdict when data was inadequate.
2. **Response rate invisible.** A very high `skipped` rate (most entries never annotated) was not visible in the criteria, allowing a GO verdict based on a small, non-representative sample.
3. **`precompute` skew.** `precompute` entries cannot be guided (ADR-004), so they always fall in Group A, inflating Group A's size and distorting the comparison.

**Changes made by ES-016:**

1. Absolute threshold (60% in guided group) replaced by **comparative criterion** (Group B > Group A AND Group B ≥ 50%).
2. **`INSUFFICIENT EVIDENCE`** verdict added for cases where no defensible conclusion is possible.
3. Four **metric definitions** added (`response_rate`, `satisfaction_rate`, `dismissal_rate`, `missing_rate`) with explicit formulas.
4. **`response_rate`** introduced as a gate condition (< 20% = INSUFFICIENT EVIDENCE; < 40% = CONDITIONAL GO).
5. **`precompute` exclusion** made explicit in the criteria.
6. **Confidence qualifiers** (Exploratory / Indicative / Not assessable) added to prevent misinterpretation of small-sample verdicts.
7. Reports must show **absolute counts alongside percentages** (prevents misleading percentage-only presentation).

**Protocol document:** `docs/investigations/ES-016-comparative-evaluation-protocol.md`

**Results template:** `docs/investigations/ES-016-evaluation-results-template.md`
