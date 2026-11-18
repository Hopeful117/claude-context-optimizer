# ES-015 — Evaluation Signal Reliability

- Status: **Gate 1 — Awaiting Human Approval**
- Date: 2026-11-17
- Base: `feat/es-011-evaluation-results` (ES-014 HEAD, `f287a73`)
- Version target: `1.0.4`

---

## Objective

Correct the semantics and naming of evaluation signals introduced in ES-014 so that each metric accurately describes what it measures. No new compaction features. No new data sources. Pure signal reliability work.

---

## Background

ES-014 introduced `evalAtom` (bounded log, 200 entries) with one entry per compaction event. ADR-005 specified `turnsToResumption` as "turns to first tool-use turn after compaction," collected lazily by `turn.complete`.

The ES-014 implementation departs from this spec: `turnsToResumption` is populated at annotation click time (the value of `turnsSinceCompaction` at that moment), not on first-tool-use detection. AC-3 from ES-014 was not implemented.

Additionally, the `UserAnnotation` enum conflates explicit dismissal ("—") with structural absence (session ended, second compaction happened, pane not visible), making `skipped` entries uninterpretable in analysis.

This story corrects both issues.

---

## Confirmed Anomalies

| ID | Description | Severity |
|---|---|---|
| A1 | `turnsToResumption` stores annotation timing, not tool-use resumption | Critical — metric name misleads |
| A2 | Dismiss ("—") and structural skip produce identical `EvalEntry` state | Confirmed — analysis distorted |
| A3 | Successive compactions leave first entry silently skipped | Confirmed — undocumented |
| A4 | `turnsAtCompaction` and `turnsBeforeCompaction` store identical value | Minor — harmless redundancy |
| A5 | SDK tool-use detection feasibility unconfirmed | Risk — ADR-005's original metric may be infeasible |

See `docs/stories/ES-015-repository-analysis.md` for full audit.

---

## Decisions

### D1 — Option B: Rename + redefine (not Option A or C)

Rename `turnsToResumption` → `turnsUntilAnnotation`. This accurately describes what is measured (turns elapsed between compaction and annotation click). The underlying counter (`turnsSinceCompaction`) is correct; only the semantic framing and name are wrong.

The metric has real but limited analytical value: annotation promptness is a weak proxy for compaction salience. It is kept because:
- It costs nothing to retain (counter already implemented and correct).
- It enables a secondary comparison: do users annotate sooner for guided compactions?
- It is honest once correctly named.

### D2 — Add `'dismissed'` to `UserAnnotation`

The "—" button now writes `userAnnotation: 'dismissed'` to `evalAtom`. Previously it only cleared `pendingAnnotationId` without touching the entry. This distinguishes:
- `skipped`: annotation never reached (session ended, second compaction, pane hidden)
- `dismissed`: user explicitly chose not to rate the compaction

### D3 — Revise ADR-005

ADR-005 §3 must be amended to:
1. Remove `turnsToResumption` and its M1-proxy claim.
2. Define `turnsUntilAnnotation` with accurate semantics.
3. Extend `UserAnnotation` with `'dismissed'`.
4. Update Go/No-Go criteria to remove `turnsToResumption` as a gate condition.

### D4 — Shape bumps

`evalAtom` shape `eval-1` → `eval-2` (structural change: renamed field + extended enum).
`paneAtom` shape `pane-4` → `pane-5` (renamed `turnsSinceCompaction` field).

Existing `eval-1` data is wiped. This is acceptable: the data was mislabeled and cannot be retroactively corrected without knowing which entries were dismissed vs. structurally skipped.

---

## Constraints

- ADR-002: No conversation content. All signals remain integers, booleans, or enums.
- ADR-003: No LLM calls, no network.
- ADR-004 / ADR-001: Fail-open invariant preserved.
- No automatic compaction.
- No new SDK features required.
- No backend, no telemetry.

---

## Out of Scope

- SDK tool-use detection (Option A rejected — infeasible and semantically fragile)
- New compaction triggers or guidance template changes
- ES-011 Go/No-Go verdict
- Dashboard or analysis UI
- Reading conversation content

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `EvalEntry.turnsUntilAnnotation: number \| null` replaces `turnsToResumption` everywhere |
| AC-2 | `PaneSnapshot.turnsUntilAnnotation` replaces `turnsSinceCompaction` everywhere |
| AC-3 | `UserAnnotation` includes `'dismissed'`; dismiss handler writes it to `evalAtom` |
| AC-4 | `evalAtom` shape is `eval-2`; `paneAtom` shape is `pane-5` |
| AC-5 | ADR-005 is amended: `turnsToResumption` removed, `turnsUntilAnnotation` defined, Go/No-Go criteria updated |
| AC-6 | Dismiss and skip entries are distinguishable in analysis |
| AC-7 | Successive compaction behavior is documented (first entry becomes `skipped`) |
| AC-8 | TypeScript compiles without error |
| AC-9 | All tests pass (`claude plugin test .`) |
| AC-10 | New regression tests cover: dismiss → dismissed, skip → skipped, successive compactions, session reset |

---

## Workflow Documents

- **Repository Analysis**: `docs/stories/ES-015-repository-analysis.md` ✅
- **Implementation Plan**: `docs/stories/ES-015-implementation-plan.md` (pending Gate 1 approval)
- **Implementation Report**: `docs/stories/ES-015-implementation-report.md` (pending Gate 2 approval)
- **Engineering Report**: `docs/stories/ES-015-engineering-report.md` (pending)
