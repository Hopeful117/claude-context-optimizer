# ES-015 — Engineering Report

- Story: ES-015
- Date: 2026-11-17
- Branch: `feat/es-015-evaluation-signal-reliability`
- Version: `1.0.4`
- Status: **Complete**

---

## Summary

ES-015 corrects the evaluation signal semantics introduced in ES-014. No new features were added. No compaction behavior was changed.

---

## Anomalies Resolved

| ID | Description | Resolution |
|---|---|---|
| A1 | `turnsToResumption` stored annotation timing, not tool-use resumption | Renamed `turnsUntilAnnotation`, definition updated in ADR-005 |
| A2 | Dismiss ("—") and structural skip produced identical `EvalEntry` state | Added `'dismissed'` to `UserAnnotation`; dismiss handler now writes it |
| A3 | Successive compactions left first entry silently skipped | Documented behavior; test added confirming expected state |

---

## What Changed

### Signal semantics

`turnsToResumption` → `turnsUntilAnnotation`:
- **Before:** Name implied measurement of work resumption. The actual measurement was annotation click timing. A misnomer regardless of analytical value.
- **After:** Name accurately describes what is measured: turns elapsed between compaction and annotation click. Limitations are documented in ADR-005.

`'skipped'` / `'dismissed'` disambiguation:
- **Before:** Explicit "—" press and structural absence were indistinguishable. `'skipped'` entries could not be filtered reliably in analysis.
- **After:** `'dismissed'` = user pressed "—". `'skipped'` = annotation never reached. The Go/No-Go criteria exclude `'skipped'` from the annotation rate denominator.

### ADR-005

The original ADR-005 M1-proxy claim (`turnsToResumption` as automated equivalent of "resumption turns") is retracted. The metric was never technically feasible without SDK tool-use detection, and the ES-014 implementation didn't attempt it. ADR-005 now reflects what is actually measured.

The Go/No-Go criteria are simplified: annotation positive rate is the primary gate. `turnsUntilAnnotation` is supplementary context — not a gate condition.

---

## What Was Not Changed

- No compaction triggers modified.
- No guidance template modified.
- No `HistoryEntry` or `historyAtom` changes.
- No `src/metrics/`, `src/advisor/`, `src/guide/`, `src/pane/` changes.
- No new network, storage, or LLM calls.
- Privacy invariants (ADR-002) fully preserved — all signals remain integers, booleans, or enums.

---

## A/B Evaluation Protocol After ES-015

The evaluation dataset is now ready to accumulate reliable data. The protocol:

**Groups:**
- Group A: entries with `wasGuided: false`
- Group B: entries with `wasGuided: true`

**Primary criterion (annotation quality):**
- Sample: `userAnnotation` ∈ {`positive`, `negative`, `dismissed`} (excludes `skipped`)
- Positive rate: `positive` / sample size
- Go threshold: positive rate ≥ 60% in Group B, based on ≥5 annotated entries per group

**Supplementary context (annotation promptness):**
- `turnsUntilAnnotation` distributions, guided vs. unguided
- Not a gate condition; useful for detecting whether guided compactions feel more disruptive or less

**Known limitations:**
- Annotation is voluntary: `skipped` entries introduce non-response bias (users who had a poor experience may be less likely to annotate)
- `dismissed` entries signal "noticed but chose not to rate" — different from `skipped` but not interpretable as positive or negative
- Sample sizes will be small during the prototype phase; thresholds are directional, not statistically validated
- Task complexity and session length are uncontrolled variables
- Users learn the guidance feature over time (learning effect)

**Data collection horizon:** Accumulate ≥5 annotated entries per group before evaluating. With typical usage (1–3 compactions per session), this requires several weeks of natural use.

---

## Tests

| File | Tests added | Tests updated |
|---|---|---|
| `hooks/register.test.ts` | 7 new ES-015 regression tests | 6 ES-014 tests updated for renamed fields |

Total: 180 pass, 0 fail.

---

## Remaining Limitations

1. **Tool-use detection not implemented.** The original ADR-005 M1 proxy (first-tool-use turn) is infeasible without SDK exposure of tool calls in `TurnCompleteEvent`. This is documented in the ADR-005 amendment and is not a regression — it was never implemented.

2. **Successive compactions.** The first annotation is permanently lost when a second compaction fires before the user annotates. This is documented behavior. For long sessions with frequent compactions, the annotation rate may appear lower than actual perception quality.

3. **Session-end annotation loss.** A pending annotation is cleared on `session.end` (clear/resume). The corresponding entry stays `skipped`. This is correct behavior — the annotation window expired — but reduces the annotation sample for sessions that end before the user annotates.

4. **Runtime validation.** MRV-ES015-1 through MRV-ES015-5 require manual validation in Claude Desktop. Unit tests cover the pure-function logic.
