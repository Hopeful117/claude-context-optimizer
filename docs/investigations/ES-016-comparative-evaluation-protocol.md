# ES-016 — Comparative Evaluation Protocol

- Story: `docs/stories/ES-016-comparative-evaluation-readiness.md`
- Date: 2026-11-18
- Status: **Active**
- Supersedes: `docs/investigations/ES-011-comparative-evaluation-protocol.md` (manual M1–M4 protocol, itself superseded by ADR-005)

---

## Purpose

This document defines the protocol for accumulating and interpreting evaluation data from `evalAtom` to determine whether guided compaction (Group B) produces measurably better outcomes than unguided compaction (Group A).

It operationalizes the decision grid and metric definitions from `docs/stories/ES-016-implementation-plan.md`.

---

## Prerequisites

Before collecting evaluation data, verify the following:

### Installation check

- [ ] v1.0.4 is running (`.claude-plugin/plugin.json` shows `"version": "1.0.4"`)
- [ ] The Context Optimizer pane opens on session start
- [ ] The pane shows "Compaction Guidance (prototype)" section with three buttons

### Runtime validation (MRV items from ES-014/ES-015)

Each item must be confirmed in Claude Desktop before trusting the accumulated data:

| ID | How to verify |
|---|---|
| MRV-006 | Trigger a compaction; check that the compaction count in the pane increments and the annotation widget appears |
| MRV-007 | After compaction, run a few turns; confirm the `turnsUntilAnnotation` counter increments (visible in pane only while annotation is pending) |
| MRV-008 | Trigger a compaction; confirm annotation widget appears. Click 👍 or 👎; confirm widget disappears |
| MRV-009 | After 3 turns, click 👍; the entry recorded should show `turnsUntilAnnotation: 3` |
| MRV-ES015-1 | Trigger a compaction; click —; confirm widget disappears (dismiss recorded) |
| MRV-ES015-2 | Allow a compaction to occur without annotating (let session end or trigger a second compaction); first entry should be `skipped` |
| MRV-ES015-3 | Trigger two compactions in rapid succession without annotating; the first entry should be `skipped` |
| MRV-ES015-4 | On first load after the ES-015 upgrade, stale `eval-1` data should be cleared (evalAtom starts empty) |
| MRV-ES015-5 | On first load after the ES-015 upgrade, stale `pane-4` data should be cleared (pane resets to defaults) |

> **Note:** Items MRV-009 through MRV-ES015-5 require the pane to expose enough information to verify (turn count, `turnsUntilAnnotation`, entry state). Until a data display feature is added, MRV-009 can be verified by manual counting. MRV-ES015-4/5 can be verified by observing a clean initial state after the first session post-upgrade.

---

## Groups

| Group | Definition | Expected entries |
|---|---|---|
| A (control) | `wasGuided === false` | Manual compactions with guidance off, auto compactions, precompute |
| B (treatment) | `wasGuided === true` | Manual and auto compactions with guidance on (`guideEnabled` or `autoGuideEnabled`) |

---

## Data Collection

### Session setup

No special setup is required. Use the plugin as naturally as possible:

- Do not interrupt sessions artificially to produce compaction events.
- Do not force compactions to generate metrics.
- Alternate between guidance on and off across sessions when reasonable — but do not force alternation if it disrupts actual work.

### Guidance toggle guidance (not a pun)

- For sessions where you want Group B data: enable the guidance toggle before the session reaches compaction depth (> 50% context fill).
- For sessions where you want Group A data: leave both toggles off (default state).
- The `autoGuideEnabled` toggle contributes Group B data for `auto` trigger events. Consider enabling it for a subset of sessions to accumulate auto-trigger data.
- `precompute` entries always land in Group A. They cannot be guided (ADR-004).

### Annotation

- Annotate voluntary. No obligation.
- Annotate shortly after compaction when the session continuity is fresh in your mind (within 1–3 turns).
- If the compaction summary feels disruptive or incomplete, annotate 👎.
- If the session continued well, annotate 👍.
- If you notice the widget but do not want to rate, press — (dismissed).
- If you miss the widget, it will become `skipped` automatically at the next compaction or session end.

### Incident logging

Record unexpected behaviors in the results template:
- Annotation widget not appearing after compaction.
- Compaction count not incrementing.
- Guidance toggle state not persisting as expected.
- Any TypeScript error visible in the plugin output.

---

## Minimum Collection Target

| Phase | Target | Purpose |
|---|---|---|
| Baseline | ≥5 annotated events (positive + negative + dismissed) in each group | Minimum to exit INSUFFICIENT EVIDENCE |
| Indicative | ≥15 annotated events per group, comparable trigger distributions | Minimum for GO/NO-GO at Indicative confidence |

Typical usage: 1–3 compactions per session. At 2 compactions/session and 50% annotation rate:
- 5 annotated events/group ≈ 5 sessions per group
- 15 annotated events/group ≈ 15 sessions per group

**Timeline estimate:** With consistent daily use, the baseline target requires 2–4 weeks. The indicative target requires 2–3 months.

---

## Analysis Procedure

Perform this analysis when the minimum collection target is reached, or when enough data has accumulated to draw a preliminary assessment.

### Step 1 — Raw counts

For each group (A and B), count:
- `total_entries`: all entries
- `positive`, `negative`, `dismissed`, `skipped`: by annotation value
- By trigger: `manual`, `auto`, `plugin`, `precompute`

### Step 2 — Exclude precompute

Remove all `precompute` entries from both groups before computing rates. These cannot be guided and their inclusion skews Group A.

**After exclusion, recount totals.**

### Step 3 — Compute metrics (per group, post-exclusion)

```
response_rate     = (positive + negative + dismissed) / total_entries
satisfaction_rate = positive / (positive + negative + dismissed)
dismissal_rate    = dismissed / (positive + negative + dismissed)
missing_rate      = skipped / total_entries
```

Report all four metrics with absolute counts.

### Step 4 — Assess comparability

| Check | Action if failed |
|---|---|
| Trigger distributions compatible (< 40pp difference on any trigger) | Note incompatibility; use trigger-stratified subsets |
| Response rates differ < 20pp between groups | Note bias; apply confidence downgrade |
| ≥5 annotated events (positive + negative + dismissed) in each group | INSUFFICIENT EVIDENCE if not met |

### Step 5 — Compare satisfaction rates

```
Δ_satisfaction = B_satisfaction_rate - A_satisfaction_rate
```

Report with counts:
```
Group A: satisfaction_rate = X% (N_A_positive / N_A_sample)
Group B: satisfaction_rate = Y% (N_B_positive / N_B_sample)
Δ = Y - X pp
```

### Step 6 — Apply decision grid

| Condition | Verdict |
|---|---|
| `Δ > 0` AND `B_satisfaction ≥ 50%` AND `≥5 annotated/group` AND comparable triggers | GO |
| Positive trend but: sample < 5, OR incomparable, OR `response_rate < 40%`, OR contradictions | CONDITIONAL GO |
| `Δ ≤ 0` after `≥10 annotated/group`, comparable samples | NO-GO |
| `< 5 annotated` in either group, OR `response_rate < 20%`, OR incomparable triggers | INSUFFICIENT EVIDENCE |

### Step 7 — Confidence qualifier

| Condition | Confidence |
|---|---|
| ≥15 annotated/group, comparable triggers | Indicative |
| ≥5 and < 15 annotated/group | Exploratory |
| Below threshold | Not assessable |

### Step 8 — Supplementary analysis

- `turnsUntilAnnotation` distribution: compare median and spread between groups. A lower median for Group B would suggest guided compactions feel less disruptive (users annotate sooner).
- Qualitative observations: record continuity check results (see D4 in Implementation Plan) for a small subset.

### Step 9 — Document limitations

Always document:
- Response rates and what they imply for sample reliability.
- Any trigger incompatibility and how it was handled.
- Any incidents observed during collection.
- Whether the sample size supports the confidence qualifier.

---

## Verdict Rendering

The verdict is rendered in the results document (`ES-016-evaluation-results-template.md`). It must include:

1. Verdict: GO / CONDITIONAL GO / NO-GO / INSUFFICIENT EVIDENCE
2. Confidence: Exploratory / Indicative / Not assessable
3. Primary justification (2–3 sentences)
4. Limitations (bullet list)
5. Recommended next step

**What a verdict is NOT:**
- It is not a statistical proof.
- It is not a measurement of token savings, cost reduction, or productivity.
- It is not a claim about the general effectiveness of compaction guidance across all users or use cases.
- An Exploratory GO does not mean the feature is validated — it means the direction is worth continuing.

---

## Connection to ADR-005

This protocol implements the Go/No-Go framework defined in ADR-005 (as amended by ES-016). The amendment replaces the absolute threshold with a comparative criterion. See `docs/architecture/ADR-005-evaluation-data-policy.md` §5 for the normative criteria.
