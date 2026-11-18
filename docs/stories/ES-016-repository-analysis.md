# ES-016 — Repository Analysis

- Story: `docs/stories/ES-016-comparative-evaluation-readiness.md`
- Date: 2026-11-18
- Branch: `feat/es-016-comparative-evaluation-readiness`
- Base commit: `cb33442` (ES-015 merged, v1.0.4)

---

## 1. Repository State

| Item | Value |
|---|---|
| Version | v1.0.4 |
| Last commit | `cb33442` — feat(ES-015): evaluation signal reliability |
| Branch | `main` (up to date, no pending work) |
| Tests | 180 pass, 0 fail |
| TypeScript | 0 errors |
| evalAtom shape | `eval-2` |
| paneAtom shape | `pane-5` |

---

## 2. Current Data Collection Infrastructure

### 2.1 evalAtom

**Identity:** `{ plugin: 'context-optimizer', key: 'eval' }`, shape `eval-2`

**Capacity:** Bounded ring-buffer, cap 200 entries. When the cap is exceeded, the oldest entries are dropped.

**Persistence:** Via `$.store` (Claude Code SDK). Persists across sessions within the same plugin installation. Does NOT persist across plugin uninstall/reinstall. Does NOT synchronize across machines.

**Scope:** Single plugin installation on a single machine. All entries — regardless of session — accumulate in the same log.

**Entry fields:**

| Field | Type | Collected when |
|---|---|---|
| `compactionId` | `string` | At `session.compact` — `${sessionId}:${compactionIndex}` |
| `wasGuided` | `boolean` | At `session.compact` — reflects actual injection, not intent |
| `trigger` | `string` | At `session.compact` — copied from event |
| `timestampMs` | `number` | At `session.compact` |
| `turnsAtCompaction` | `number` | At `session.compact` — main-session turns at time of compaction |
| `turnsUntilAnnotation` | `number \| null` | At annotation click (👍 or 👎); null if annotation not provided |
| `userAnnotation` | `UserAnnotation` | Default `skipped`; updated at annotation or dismiss |

**Annotation values:**

| Value | Meaning |
|---|---|
| `positive` | User rated compaction summary useful (👍) |
| `negative` | User rated compaction summary not useful (👎) |
| `dismissed` | User explicitly declined to rate (—) |
| `skipped` | No annotation received (second compaction fired, session ended, pane not visible) |

### 2.2 historyAtom

**Compact-kind entries carry:**
- `wasGuided?: boolean` — same value as `evalAtom`
- `turnsBeforeCompaction?: number` — same value as `evalAtom.turnsAtCompaction`
- `contextPercentAtCompaction?: number | null` — context fill % at compaction time

**No shared stable identifier** between `historyAtom` and `evalAtom`. Joining by `timestampMs` or position is unreliable. The two atoms should be analyzed independently.

### 2.3 paneAtom (live state, not persisted for analysis)

Tracks `pendingAnnotationId` and `turnsUntilAnnotation` as mutable session state. These are reset on session events. Not intended as analysis data.

---

## 3. ADR-005 Go/No-Go Criteria — Identified Limits

### 3.1 Absolute threshold without comparative baseline

**Current criteria:**
```
GO: positive rate ≥ 60% in guided group, ≥5 annotated events (positive + negative + dismissed)
CONDITIONAL GO: same rate, sample < 5
NO-GO: no improvement after ≥10 annotated events per group
```

**Problem:** The threshold applies only to the guided group. If the unguided group also achieves 60% or higher, the criteria will produce a GO verdict even when guided compaction performs worse.

**Illustration:**
- Unguided group (A): 80% positive rate
- Guided group (B): 62% positive rate
- Current criteria: GO (threshold met, ≥5 events)
- Correct interpretation: guided compaction underperforms unguided

### 3.2 `dismissed` counted in denominator, not numerator

The criteria state: "excluding skipped." `dismissed` entries ARE counted in the sample. This means a user who consistently dismisses the annotation widget contributes to the denominator but not the numerator, lowering the positive rate — without expressing a negative opinion.

This is documented in ADR-005 §4 but the GO threshold does not account for it.

### 3.3 No INSUFFICIENT EVIDENCE state

The current grid has three outcomes: GO, CONDITIONAL GO, NO-GO. There is no state for the case where data is accumulated but no defensible conclusion can be drawn (high skipped rate, unequal group sizes, incomparable triggers, contradictory observations). The absence of a fourth state risks forcing a premature verdict.

### 3.4 NO-GO criterion conflates absence of improvement with active degradation

"No improvement after ≥10 annotated events per group" covers both: (a) guided slightly below unguided, and (b) guided significantly worse than unguided. These warrant different responses (refine template vs abandon feature).

### 3.5 `turnsUntilAnnotation` not a gate condition (correctly)

ADR-005 (amended by ES-015) already removed `turnsUntilAnnotation` as a gate. This is correct. The metric measures annotation timing, not context quality. No change needed here.

### 3.6 Sample adequacy

No minimum per-group sample is defined for the NO-GO verdict (only "≥10 annotated events per group"). The GO and CONDITIONAL GO criteria distinguish ≥5 vs <5. This is a reasonable heuristic but should be explicitly labeled as exploratory, not statistically validated.

---

## 4. Annotation Metrics — Semantic Analysis

### 4.1 Current usage

ADR-005 §5 defines:
- Sample = `positive + negative + dismissed`
- Positive rate = `positive / sample`
- `skipped` excluded

### 4.2 Issues

**Issue 1 — Missing rates are invisible.** A very high `skipped` rate (say, 90% of entries) would be hidden in the current criteria. The positive rate could be 70% based on 5 events while 45 events are `skipped`. The dataset does not support GO.

**Issue 2 — `dismissed` in denominator inflates apparent engagement.** A user who dismisses every prompt has a 0% positive rate despite having no negative opinion. If the guided group has more dismissals than the unguided group, the comparison is biased.

**Issue 3 — No response rate metric defined.** The fraction of entries that receive any user response (positive, negative, or dismissed) is a critical quality indicator for the dataset. Without it, the sample size alone is misleading.

### 4.3 Metrics needed

The analysis in ES-016 defines four metrics. See the Implementation Plan for formal definitions.

---

## 5. Group Comparability

### 5.1 Groups

- Group A (control): `wasGuided === false`
- Group B (treatment): `wasGuided === true`

### 5.2 Variables that differ between groups

| Variable | Available in evalAtom | Available via historyAtom join |
|---|---|---|
| `trigger` | ✅ Direct field | — |
| `turnsAtCompaction` | ✅ Direct field | — (same value) |
| `timestampMs` | ✅ Direct field | — |
| `contextPercentAtCompaction` | ❌ Not in evalAtom | Unreliable join (no shared ID) |
| Session depth (session index) | ❌ Not available | ❌ Not available |
| Number of successive compactions | Inferable from compactionId | — |

**Key finding:** `trigger` is directly available in `evalAtom`. This is the most important comparability variable and should be stratified in analysis.

**Key limitation:** No shared stable identifier between `evalAtom` and `historyAtom`. Cross-atom joins are not reliable. The analysis should be conducted on `evalAtom` alone.

### 5.3 Trigger stratification

ADR-004 defines four triggers:

| Trigger | Guidance possible | Group B includes |
|---|---|---|
| `manual` | YES (guideEnabled) | Yes |
| `plugin` | YES (guideEnabled) | Yes |
| `auto` | YES (autoGuideEnabled) | Possibly |
| `precompute` | NO (always excluded) | No |

A `precompute` entry in `evalAtom` will always be `wasGuided: false`. Pooling `precompute` and `manual` entries in Group A without stratification would artificially lower Group A's comparability with Group B.

**Recommendation:** Report trigger distributions for both groups. When comparing annotation rates, compare same-trigger subsets where possible.

---

## 6. evalAtom Data Access

### 6.1 Is the data accessible?

`evalAtom` is persisted via `$.store`, which is an opaque key-value store managed by the Claude Code SDK. The SDK does not expose a direct read API outside of plugin event handlers.

**Consequence:** The data cannot be read by an external script without instrumenting the plugin itself.

### 6.2 Access options

**Option A — Manual observation.** No code change required. The pane already shows compaction count and annotation state. A user can manually record annotations and counts as they occur. No programmatic access to historical entries.

**Option B — Display panel in pane.** Add a summary section to the pane showing `evalAtom` aggregate statistics (counts by annotation type, by group). Read-only display. Requires a small code change and human approval (new feature, needs Gate 2 approval). Does not export raw entries.

**Option C — User-triggered export.** Add an export button to the pane that serializes `evalAtom` contents to a file or clipboard. Requires a new code change, ADR if the output leaves the plugin boundary, and human approval. Most invasive option.

**Initial recommendation for ES-016:** Option A (manual observation) for immediate needs; plan Option B as a future story if data volume justifies it. Option C deferred pending a privacy/data-flow ADR.

### 6.3 Persistence between sessions

Yes. `$.store` persists between sessions. The 200-entry cap is the only limit. Under typical usage (1–3 compactions per session), the cap supports 65–200 sessions of data before the oldest entries are dropped.

### 6.4 Session identification within evalAtom

`compactionId = ${sessionId}:${compactionIndex}`. The sessionId prefix allows grouping by session. The index suffix allows ordering within a session.

**Note:** `sessionId` is an opaque identifier. It does not encode date or other metadata.

### 6.5 Producing a reproducible report

Without a programmatic export (Option C), a reproducible report requires the user to record observations manually or add display instrumentation (Option B). The results template (ES-016) is designed for manual entry.

---

## 7. Remaining Runtime Validations

The following MRV items from ES-014/ES-015 have not been confirmed in a live Claude Desktop session:

| ID | Behavior | Story | Status |
|---|---|---|---|
| MRV-006 | `evalAtom` entry appended after each compaction — `compactionId` correct | ES-014 | Unconfirmed |
| MRV-007 | `paneAtom.turnsUntilAnnotation` increments on main-session turns; unchanged on subagent turns | ES-014/015 | Unconfirmed |
| MRV-008 | Annotation widget appears after compaction; disappears after 👍/👎/— | ES-014 | Unconfirmed |
| MRV-009 | `turnsUntilAnnotation` in `evalAtom` matches counter at annotation time | ES-014/015 | Unconfirmed |
| MRV-010 | Annotation atom write failure silently swallowed; pane continues rendering | ES-014 | Unconfirmed |
| MRV-ES015-1 | Dismiss (—) writes `dismissed` to `evalAtom` | ES-015 | Unconfirmed |
| MRV-ES015-2 | `dismissed` and `skipped` are distinguishable in evalAtom entries | ES-015 | Unconfirmed |
| MRV-ES015-3 | Successive compaction leaves first entry as `skipped` | ES-015 | Unconfirmed |
| MRV-ES015-4 | evalAtom shape `eval-2` clears stale `eval-1` data on first load | ES-015 | Unconfirmed |
| MRV-ES015-5 | paneAtom shape `pane-5` clears stale `pane-4` data on first load | ES-015 | Unconfirmed |

These validations are prerequisites to trusting the data accumulated during the evaluation period.

---

## 8. Conclusions

### What is in good shape

- Data model is clean and well-specified (ES-015).
- Fail-open invariant is preserved throughout.
- Privacy constraints (ADR-002) are fully respected — all stored fields are integers, booleans, or enums.
- `dismissed` vs `skipped` disambiguation is now correct.
- `trigger` field enables stratification.

### What needs to be addressed in ES-016

1. ADR-005 GO criterion must be made comparative (not just absolute threshold on guided group).
2. `INSUFFICIENT EVIDENCE` verdict state must be defined.
3. Annotation metrics must include response rate and distinguish satisfaction rate from participation rate.
4. High `skipped` rate must visibly affect confidence, not be hidden.
5. `precompute` entries must be excluded from or labeled separately in comparisons.
6. Runtime validations (MRV-006 through MRV-ES015-5) must be completed before evaluation data is trusted.
7. Data access strategy must be documented (preferring Option A for now).

### What is out of scope for ES-016

- Implementing Option B or C (new code features).
- Rendering a verdict on guided compaction effectiveness (no data).
- Modifying ADR-005 without human approval at Gate 1.
