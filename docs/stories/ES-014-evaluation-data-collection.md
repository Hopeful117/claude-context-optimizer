# ES-014 — Evaluation Data Collection

- Status: **In Progress — Awaiting Gate 1 Approval**
- Date: 2026-11-17
- Branch: `feat/es-014-evaluation-data-collection` (to be created)
- Base: `main` (v1.0.2 — ES-013 merged, `ad7bada`)
- Version target: `1.0.3`

---

## Objective

Implement the automated evaluation data collection infrastructure specified in ADR-005. Replace the manual ES-011 A/B evaluation protocol with persisted, traceable behavioral proxies.

Three deliverables:

1. **`evalAtom`** — new bounded append-only atom (`eval-1`, cap 200) storing one entry per compaction event: `compactionId`, `wasGuided`, `trigger`, `timestampMs`, `turnsToResumption`, `userAnnotation`.

2. **`turnsToResumption` collector** — lazy collection in `turn.complete`: after each compaction, count turns until the first tool-use turn and write the result into the matching `evalAtom` entry by `compactionId`.

3. **In-pane annotation widget** — a one-line post-compaction prompt ("Summary useful? 👍 👎 —") rendered in the pane after each compaction. User's choice (`positive` / `negative` / `skipped`) is appended to the matching `evalAtom` entry. Fail-open: annotation failure must never affect pane rendering.

Additionally:
- Extend `HistoryEntry` (compact kind) with `turnsBeforeCompaction: number` and `contextPercentAtCompaction: number | null`.
- Update `PluginState` to include the `eval` key.

---

## Motivation

ADR-005 (approved 2026-11-17) supersedes the manual M1–M4 evaluation protocol. It requires this implementation before the ES-011 Go/No-Go verdict can be rendered.

---

## Constraints

- **ADR-002:** No conversation content stored. All signals are integers, booleans, or enums.
- **ADR-003:** No LLM calls, no network. Data collection is purely local.
- **ADR-004 / ADR-001:** Fail-open. Annotation atom write failure must not affect session behavior or pane rendering. `next(event)` always called.
- **Atom discipline:** `evalAtom` identity `{ plugin: 'context-optimizer', key: 'eval' }`, shape `eval-1`. Shape bump required if structure changes.
- **No automatic compaction.** This story adds no new triggers.

---

## Out of Scope

- Analysis tooling or reporting UI for `evalAtom` data — deferred.
- ES-011 Go/No-Go verdict — blocked on data accumulation after this story ships.
- Changes to advisor rules or guidance template.
- MRV validation of ES-013 (separate concern).

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `evalAtom` exists with shape `eval-1`, cap 200, identity `{ plugin: 'context-optimizer', key: 'eval' }` |
| AC-2 | Each `session.compact` appends one entry to `evalAtom` with `compactionId`, `wasGuided`, `trigger`, `timestampMs`, `turnsToResumption: null` (lazy), `userAnnotation: 'skipped'` (default) |
| AC-3 | `turn.complete` fills `turnsToResumption` for the most recent pending entry (first tool-use turn after compaction) |
| AC-4 | In-pane annotation widget renders after each compaction; clicking 👍/👎 updates the entry; "—" leaves it as `skipped` |
| AC-5 | Annotation failure (atom write fails) is silently swallowed; pane continues rendering |
| AC-6 | `HistoryEntry` compact entries carry `turnsBeforeCompaction` and `contextPercentAtCompaction` |
| AC-7 | `PluginState` includes `eval: Shaped<EvalEntry[]>` |
| AC-8 | TypeScript compiles without error |
| AC-9 | All tests pass (`claude plugin test .`) |
| AC-10 | ADR-005 is updated from `Proposed` to `Accepted` |

---

## Workflow Documents

- **Repository Analysis**: `docs/stories/ES-014-repository-analysis.md` (pending)
- **Implementation Plan**: `docs/stories/ES-014-implementation-plan.md` (pending Gate 1 approval)
- **Implementation Report**: `docs/stories/ES-014-implementation-report.md` (pending Gate 2 approval)
- **Engineering Report**: `docs/stories/ES-014-engineering-report.md` (pending)
