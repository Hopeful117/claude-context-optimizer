# ES-016 — Evaluation Results

- Protocol: `docs/investigations/ES-016-comparative-evaluation-protocol.md`
- Mod version: <!-- fill in: e.g. v1.0.4 -->
- Observation period: <!-- fill in: e.g. 2026-11-18 → 2026-12-15 -->
- Analysis date: <!-- fill in -->
- Status: **In Progress — collecting data**

> **Instructions:** Fill this template after reaching the minimum collection target (≥5 annotated events per group, excluding precompute). Do not invent values. If data is not yet available, leave the field blank or write `—`. All percentages must show absolute counts.

---

## 1. Raw Counts

### 1.1 Total entries in evalAtom

| | Group A (`wasGuided=false`) | Group B (`wasGuided=true`) |
|---|---|---|
| Total entries | — | — |

### 1.2 Annotation breakdown (all entries, before exclusion)

| Annotation | Group A | Group B |
|---|---|---|
| `positive` | — | — |
| `negative` | — | — |
| `dismissed` | — | — |
| `skipped` | — | — |
| **Total** | — | — |

### 1.3 Trigger breakdown (all entries, before exclusion)

| Trigger | Group A | Group B |
|---|---|---|
| `manual` | — | — |
| `auto` | — | — |
| `plugin` | — | — |
| `precompute` | — | — |
| **Total** | — | — |

---

## 2. After Precompute Exclusion

> Remove all `precompute` entries from both groups. Recount.

| | Group A (excl. precompute) | Group B (excl. precompute) |
|---|---|---|
| Total entries | — | — |
| `positive` | — | — |
| `negative` | — | — |
| `dismissed` | — | — |
| `skipped` | — | — |

---

## 3. Computed Metrics

> All rates computed on post-exclusion totals.

| Metric | Formula | Group A | Group B |
|---|---|---|---|
| **Response rate** | (pos+neg+dis) / total | — / — = —% | — / — = —% |
| **Satisfaction rate** | pos / (pos+neg+dis) | — / — = —% | — / — = —% |
| **Dismissal rate** | dis / (pos+neg+dis) | — / — = —% | — / — = —% |
| **Missing rate** | skipped / total | — / — = —% | — / — = —% |

**Δ satisfaction = B_satisfaction − A_satisfaction = —pp**

---

## 4. Comparability Assessment

### 4.1 Trigger compatibility

| Check | Result | Notes |
|---|---|---|
| Trigger distributions compatible (< 40pp diff on any trigger) | ☐ Yes ☐ No | |
| Response rates compatible (< 20pp diff between groups) | ☐ Yes ☐ No | |
| ≥5 annotated events (pos+neg+dis) in Group A | ☐ Yes ☐ No | count: — |
| ≥5 annotated events (pos+neg+dis) in Group B | ☐ Yes ☐ No | count: — |

### 4.2 Incompatibilities and mitigations

<!-- Describe any incompatibilities and how they were handled (e.g., trigger-stratified sub-analysis). -->

---

## 5. Supplementary: turnsUntilAnnotation

| Metric | Group A | Group B |
|---|---|---|
| Median turnsUntilAnnotation (non-null only) | — | — |
| Min / Max | — | — |
| Null (not annotated) count | — | — |

---

## 6. Qualitative Observations

> Optional. Record for ≤5 compactions. Do not record conversation content.

### Observation 1

- Group: A / B
- Trigger: —
- Objective continuity: Yes / No / Partial
- Decision continuity: Yes / No / Partial
- Constraint continuity: Yes / No / Partial
- File continuity: Yes / No / Partial
- Re-statement cost: 0 / 1–2 / 3+
- Notes: —

### Observation 2

- Group: A / B
- Trigger: —
- Objective continuity: Yes / No / Partial
- Decision continuity: Yes / No / Partial
- Constraint continuity: Yes / No / Partial
- File continuity: Yes / No / Partial
- Re-statement cost: 0 / 1–2 / 3+
- Notes: —

---

## 7. Incidents

> Record unexpected plugin behaviors observed during the evaluation period.

| Date | Description | Resolved? |
|---|---|---|
| — | — | — |

---

## 8. Verdict

### 8.1 Decision grid

| Condition | Met? |
|---|---|
| `Δ > 0` (B satisfaction > A satisfaction) | ☐ Yes ☐ No |
| `B_satisfaction ≥ 50%` | ☐ Yes ☐ No |
| `≥5 annotated events/group` (post-exclusion) | ☐ Yes ☐ No |
| Trigger distributions comparable | ☐ Yes ☐ No |
| `Response rate ≥ 40%` in both groups | ☐ Yes ☐ No |

### 8.2 Verdict

**Verdict:** <!-- GO / CONDITIONAL GO / NO-GO / INSUFFICIENT EVIDENCE -->

**Confidence:** <!-- Exploratory (5–14/group) / Indicative (≥15/group) / Not assessable -->

### 8.3 Justification

<!-- 2–3 sentences. State the key numbers and what they support or fail to support. -->

### 8.4 Limitations

<!-- Bullet list. Required even for a GO verdict. -->

- 
- 

### 8.5 Recommended next step

<!-- One action: continue collecting, refine template, extend to auto trigger, freeze feature, etc. -->

---

## 9. Methodological Notes

This evaluation measures user perception of compaction summary quality via voluntary annotations. It does not measure:

- Token savings or cost reduction.
- Productivity improvement.
- Actual fidelity of preserved context (content is never read).
- Generalizability beyond this single user and installation.

A GO verdict at Exploratory confidence means: for this user, in this usage context, guided compaction annotations trend more positively than unguided ones. It is a directional signal, not a proof of superiority.

The annotation sample is voluntary and subject to non-response bias. Users who had a poor compaction experience may be less likely to annotate, inflating positive rates in both groups.
