# ES-011 — Comparative Evaluation Protocol

## Objective

Determine whether guided compaction (`guideEnabled=true`) produces measurably better context continuity than unguided compaction.

---

## Groups

| Group | Configuration | Sessions required |
|---|---|---|
| A (control) | `guideEnabled=false` (default) | ≥3 compaction events |
| B (treatment) | `guideEnabled=true` | ≥3 compaction events |

Each session should have non-trivial context (≥10 turns, ≥1 open task, ≥1 key decision made).

---

## Metrics

For each compaction event, record:

| Metric | Description | How to measure |
|---|---|---|
| M1 — Resumption turns | Turns needed after compaction before work effectively resumed | Count turns until the first substantive contribution to the task |
| M2 — Corrections needed | Number of times context was explicitly re-explained or corrected by the user | Count explicit re-statements |
| M3 — Key decisions preserved | Were decisions made before compaction available after without re-explanation? | Boolean per session |
| M4 — Files preserved | Were active file paths retained in the summary? | Boolean per session |

---

## Go/No-Go Criteria

**GO (extend to auto trigger):**
- ≥2 of {M1, M2, M3, M4} show improvement in Group B vs Group A
- Based on ≥3 events per group

**NO-GO (remove or freeze prototype):**
- No improvement on any metric after ≥5 events per group
- Or: Group B summaries are significantly longer without better content

**CONDITIONAL GO (refine template):**
- M3 or M4 improved but M1/M2 unchanged
- Action: refine PRESERVATION_TEMPLATE, re-evaluate

---

## Notes

- Evaluation is qualitative. Precision is not required — directional signal is sufficient.
- Record results in `docs/investigations/ES-011-comparative-evaluation-results.md`.
- Minimum 3 events per group before drawing conclusions.
