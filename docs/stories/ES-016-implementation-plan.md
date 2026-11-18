# ES-016 — Implementation Plan

- Story: `docs/stories/ES-016-comparative-evaluation-readiness.md`
- Date: 2026-11-18
- Status: **Gate 1 — Awaiting Human Approval**

---

## Overview

ES-016 is a documentary story. The deliverables are:

1. This implementation plan (Gate 1).
2. An ADR-005 amendment proposal (requires human approval before writing).
3. `docs/investigations/ES-016-comparative-evaluation-protocol.md`
4. `docs/investigations/ES-016-evaluation-results-template.md`
5. `docs/stories/ES-016-engineering-report.md`

No production code changes are planned. If a code change becomes technically necessary, it will be proposed at Gate 2.

---

## D1 — Comparative Decision Grid

### Four-state grid

| Verdict | Criteria |
|---|---|
| **GO** | Group B positive rate > Group A positive rate AND Group B positive rate ≥ 50%, based on ≥5 annotated events (positive + negative + dismissed) per group, with comparable trigger distributions |
| **CONDITIONAL GO** | Results trend positive for Group B but: sample < 5 per group, OR groups are not comparable (trigger distribution differs significantly), OR response rate < 40% in either group, OR observations are contradictory |
| **NO-GO** | Group B positive rate ≤ Group A positive rate after ≥10 annotated events per group, with comparable samples |
| **INSUFFICIENT EVIDENCE** | Fewer than 5 annotated events in either group, OR response rate < 20% in either group, OR trigger distributions are incompatible for comparison |

### Confidence qualifier

Each verdict must carry a confidence qualifier:

| Confidence | Condition |
|---|---|
| **Exploratory** | ≥5 and < 15 annotated events per group |
| **Indicative** | ≥15 annotated events per group, comparable triggers |
| **Not assessable** | INSUFFICIENT EVIDENCE state |

**Important:** GO at Exploratory confidence does not constitute statistical proof. It signals a direction worth continuing. The threshold values above are directional estimates, not scientifically validated significance levels.

### Rationale for 50% floor in GO

A relative improvement (B > A) is necessary but not sufficient. If Group A has 20% positive rate and Group B has 25%, the difference is real but both groups indicate a poor experience. A 50% floor ensures the guided experience is at least roughly satisfactory in absolute terms before claiming improvement.

---

## D2 — Annotation Metric Definitions

### Four primary metrics

**Response rate** (per group)
```
response_rate = (positive + negative + dismissed) / total_entries
```
Proportion of entries that received any user response. Measures dataset participation quality. A response rate below 40% means the annotation sample represents a minority of compaction events and comparisons should be treated with caution.

**Satisfaction rate** (per group, among responses)
```
satisfaction_rate = positive / (positive + negative + dismissed)
```
Proportion of annotated events rated positively. This is the primary comparative metric. Used in the GO/NO-GO decision.

**Dismissal rate** (per group, among responses)
```
dismissal_rate = dismissed / (positive + negative + dismissed)
```
Proportion of responded events where the user explicitly chose not to rate. A high dismissal rate may indicate annotation fatigue or that the annotation widget is poorly positioned. It does NOT indicate negative opinion.

**Missing data rate** (per group)
```
missing_rate = skipped / total_entries
```
Proportion of entries where no annotation was ever received. Structural absence — not a user opinion.

### Display requirements

All reports must show absolute counts alongside percentages:
```
Group A: total=12, positive=4, negative=2, dismissed=1, skipped=5
  response_rate: 7/12 = 58%
  satisfaction_rate: 4/7 = 57%
  dismissal_rate: 1/7 = 14%
  missing_rate: 5/12 = 42%
```

### Semantic constraints

- `dismissed` ≠ dissatisfied. Never count `dismissed` as negative in satisfaction_rate.
- `skipped` ≠ dissatisfied. Never count `skipped` as negative.
- A group with high `skipped` rate may appear to have high satisfaction_rate — the response_rate makes this visible.
- If the two groups have different response rates, the satisfaction_rate comparison is biased. Document this explicitly when it occurs.

---

## D3 — Group Comparability Protocol

### Stratification by trigger

Always report trigger distributions for both groups before comparing satisfaction rates:

```
Group A triggers: manual=3, auto=5, plugin=0, precompute=4
Group B triggers: manual=4, auto=4, plugin=1, precompute=0
```

**Exclude `precompute` entries from both groups** for the primary comparison. `precompute` can never be guided (ADR-004), so all `precompute` entries land in Group A, inflating its size without contributing to a fair comparison.

**When trigger distributions are incompatible** (e.g., Group A is 80% `auto`, Group B is 80% `manual`), do not pool results. Report trigger-stratified subsets only. Use CONDITIONAL GO or INSUFFICIENT EVIDENCE.

### Recommended analysis order

1. Count total entries per group.
2. Report trigger distributions, then exclude `precompute`.
3. Report response rates.
4. If response rates are comparable (< 20pp difference), proceed to satisfaction rate comparison.
5. If response rates differ significantly, note the bias in the conclusion.
6. Compare satisfaction rates with absolute counts.
7. Report `turnsUntilAnnotation` distributions as supplementary context.
8. Render verdict with confidence qualifier.

---

## D4 — Qualitative Protocol (Lightweight, Voluntary)

### Purpose

Annotation 👍/👎 measures perceived usefulness of the compaction summary. It does not directly measure context continuity. A lightweight qualitative check can supplement the annotation data for a small number of compactions.

### Protocol

After a compaction (guided or unguided), optionally check the following within the same session:

| Check | Question | Record as |
|---|---|---|
| Objective continuity | Is the current objective still visible/known without re-stating it? | Yes / No / Partial |
| Decision continuity | Are key decisions made before compaction available without re-explanation? | Yes / No / Partial |
| Constraint continuity | Are working constraints (style, naming, architecture) still applied? | Yes / No / Partial |
| File continuity | Are the relevant files still referenced without re-introduction? | Yes / No / Partial |
| Re-statement cost | Did the user need to repeat information? | 0 / 1–2 / 3+ re-statements |

### Constraints

- Manual and voluntary. Never automatic.
- Record for a small subset of compactions (2–5 total across groups) to illustrate the annotation signal.
- Do not read conversation content, compaction summary text, or file bodies.
- Record only the boolean/count outcome above, not the content.
- Results are supplementary — they do not override the annotation signal.

---

## D5 — Data Access Strategy

### Recommended approach: Option A (manual observation)

For the first evaluation period, the user records observations manually using the results template (`ES-016-evaluation-results-template.md`). The pane already shows compaction count. The annotation widget provides the primary signal at interaction time.

**Rationale:** The evaluation period requires only aggregate counts (how many guided/unguided events, how many positive/negative/dismissed/skipped). These can be tracked manually with low overhead during the evaluation period.

### Future option: in-pane summary (Option B)

If the evaluation period extends beyond 20–30 compaction events, an in-pane aggregate display (read-only) would reduce manual overhead. This is a scope decision for a future story and requires Gate 2 approval.

Option B does not export raw entries. It displays aggregates (counts by annotation type, by wasGuided). No new privacy surface.

### Option C: user-triggered export — deferred

A button that serializes `evalAtom` contents requires a data-flow ADR (the data would leave the plugin boundary into a file or clipboard). Deferred until the evaluation methodology is proven worth the complexity.

---

## D6 — ADR-005 Amendment Proposal

**This is a proposal. It requires human approval before the amendment is written.**

### Proposed changes

**§5 — Go/No-Go criteria:**

Replace the current criteria:
```
GO: positive rate ≥ 60% in guided group, ≥5 annotated events
CONDITIONAL GO: same rate, sample < 5
NO-GO: no improvement after ≥10 annotated events per group
```

With the comparative grid from D1:
```
GO: B_satisfaction_rate > A_satisfaction_rate AND B_satisfaction_rate ≥ 50%, ≥5 annotated/group, comparable triggers
CONDITIONAL GO: results trend positive but: sample < 5, OR incomparable groups, OR response_rate < 40%, OR contradictory
NO-GO: B_satisfaction_rate ≤ A_satisfaction_rate after ≥10 annotated events/group, comparable samples
INSUFFICIENT EVIDENCE: < 5 annotated events in either group, OR response_rate < 20%, OR incomparable triggers
```

**Add §8 — Metric Definitions:**

Formal definitions of response_rate, satisfaction_rate, dismissal_rate, missing_rate as defined in D2.

**Add §9 — Comparability Requirements:**

Stratification protocol as defined in D3.

**Update §5 Note on thresholds:**

Add explicit statement: "Thresholds are directional estimates for the prototype phase. They are not statistically validated significance levels. A GO at Exploratory confidence (< 15 events/group) is a directional signal, not a proof of superiority."

### Impact on existing accepted criteria

The 60% absolute threshold is replaced by a relative comparison. This is a methodological improvement, not a relaxation. It makes it harder to claim GO when the unguided group performs equally well.

The NO-GO criterion becomes more nuanced: guidance must demonstrably not improve results, not merely fail to reach a threshold.

---

## Deliverable Summary

| Deliverable | File | Status |
|---|---|---|
| Story | `docs/stories/ES-016-comparative-evaluation-readiness.md` | ✅ Created |
| Repository Analysis | `docs/stories/ES-016-repository-analysis.md` | ✅ Created |
| Implementation Plan (this doc) | `docs/stories/ES-016-implementation-plan.md` | ✅ Created |
| ADR-005 Amendment | `docs/architecture/ADR-005-evaluation-data-policy.md` | ⏳ Pending human approval |
| Comparative Evaluation Protocol | `docs/investigations/ES-016-comparative-evaluation-protocol.md` | ⏳ Pending Gate 2 |
| Evaluation Results Template | `docs/investigations/ES-016-evaluation-results-template.md` | ⏳ Pending Gate 2 |
| Engineering Report | `docs/stories/ES-016-engineering-report.md` | ⏳ Pending Gate 2 |
