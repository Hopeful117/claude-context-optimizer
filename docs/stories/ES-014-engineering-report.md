# ES-014 — Engineering Report

- Story: `docs/stories/ES-014-evaluation-data-collection.md`
- Repository Analysis: `docs/stories/ES-014-repository-analysis.md` ✅ Approved 2026-11-17
- Implementation Plan: `docs/stories/ES-014-implementation-plan.md` ✅ Approved 2026-11-17
- Implementation Report: `docs/stories/ES-014-implementation-report.md` ✅
- Code Review: Independent review completed 2026-11-17 — PASS WITH FINDINGS (1 major, 2 minor, all resolved)
- Date: 2026-11-17
- Version: v1.0.3

---

## Summary

ES-014 implements the automated evaluation data collection infrastructure defined in ADR-005. The plugin now records one `EvalEntry` per compaction event in `evalAtom`, counts post-compaction main-session turns via `paneAtom.turnsSinceCompaction`, and surfaces an optional in-pane annotation widget (👍/👎/—) that records `turnsToResumption` and `userAnnotation` at annotation time.

173/173 tests pass, zero TypeScript errors. ADR-005 status updated to Accepted.

---

## Code Review Findings

| Finding | Severity | Action |
|---|---|---|
| `turnsToResumption = 1` hardcoded — metric can never vary, binary flag not a count | Major | ✅ Resolved — replaced with `turnsSinceCompaction` counter; `pendingAnnotationId` no longer cleared by `turn.complete`; `turnsToResumption` set at annotation time |
| `pane` shape string not bumped after adding `pendingAnnotationId` | Minor | ✅ Resolved — shape bumped to `pane-4` with reason comment |
| `paneAtom default` test `initialPane` missing new fields | Minor | ✅ Resolved — `pendingAnnotationId: null` and `turnsSinceCompaction: 0` added to test object; assertions added |

---

## Final Architecture

### evalAtom design

After code review corrections, the final design is:

1. **`session.compact`**: appends `EvalEntry` with `turnsToResumption: null`, `userAnnotation: 'skipped'`, `turnsSinceCompaction` reset to 0 in `paneAtom`.
2. **`turn.complete`** (main-session only): increments `paneAtom.turnsSinceCompaction`. Does NOT clear `pendingAnnotationId`.
3. **Annotation buttons**: `turnsToResumption = snap.turnsSinceCompaction` recorded in matching `evalAtom` entry; `pendingAnnotationId` cleared.
4. **Dismiss (—)**: `pendingAnnotationId` cleared; `turnsToResumption` stays `null`.
5. **Session end**: pane reset clears both `pendingAnnotationId` and `turnsSinceCompaction`.

This produces a meaningful distribution of `turnsToResumption` values across sessions — the data ADR-005 required.

---

## Quality Results

**Test run:** `claude plugin test .` — Claude Code SDK 2.1.325

| Metric | Value |
|---|---|
| Tests | 173 pass / 0 fail |
| Files | 10 |
| Known pre-existing failures | 0 |
| TypeScript errors | 0 |

---

## Modified Files

| File | Type | Change |
|---|---|---|
| `types/index.d.ts` | Modified | `EvalEntry`, `EvalLog`, `UserAnnotation`; `HistoryEntry` +2 optional fields; `PaneSnapshot` + `pendingAnnotationId` + `turnsSinceCompaction`; `PluginState` + `eval` key |
| `src/metrics/types.ts` | Modified | `HistoryEntry` mirror (+2 optional fields) |
| `src/metrics/normalize.ts` | Modified | `MakeEntryParams` +2 fields; `makeEntry` propagation |
| `hooks/register.tsx` | Modified | `evalAtom`; shape `pane-4`; reset paths; `session.compact` extension; `turn.complete` counter; annotation widget |
| `hooks/register.test.ts` | Modified | 12 new ES-014 tests; existing `paneAtom default` test completed |
| `docs/architecture/ADR-005-evaluation-data-policy.md` | Modified | Status `Proposed` → `Accepted` |
| `AGENTS.md` | Modified | Version v1.0.2 → v1.0.3; Current Work |
| `docs/roadmap.md` | Modified | Phase 3 entries; ES-011 evaluation note; ADR-005 and ES-014 entries |
| `.claude-plugin/plugin.json` | Modified | Version 1.0.2 → 1.0.3 |
| `docs/stories/ES-014-*.md` | New (5) | Story artifacts |

---

## Manual Runtime Validation Remaining

The following behaviors require a live Claude Desktop session to verify:

| ID | Behavior |
|---|---|
| MRV-006 | `evalAtom` entry appended after each compaction — `compactionId` correct |
| MRV-007 | `paneAtom.turnsSinceCompaction` increments on main-session turns; unchanged on subagent turns |
| MRV-008 | Annotation widget appears after compaction; disappears after 👍/👎/— |
| MRV-009 | `turnsToResumption` in `evalAtom` matches `turnsSinceCompaction` at annotation time |
| MRV-010 | Annotation atom write failure is silently swallowed; pane continues rendering |

---

## ADR Compliance

| ADR | Status |
|---|---|
| ADR-001 — fail-open, `next()` always called | ✅ All new code inside existing try blocks; `next()` path unchanged |
| ADR-002 — no conversation content stored | ✅ `EvalEntry` stores only integers, booleans, enums |
| ADR-003 — deterministic recommendations, no LLM | ✅ No LLM calls; advisor untouched |
| ADR-004 — no automatic compaction | ✅ No new triggers |
| ADR-005 — evaluation data policy | ✅ Implemented and accepted |

---

## Vault Outcome

Vault was not consulted. Local infrastructure story with no cross-project architectural content.

**Vault outcome: No action.**

---

## Next Steps

1. **PR creation** — this branch is ready for PR.
2. **MRV-006–010** — manual runtime validation in a live Claude Desktop session after merge.
3. **ES-011 Go/No-Go verdict** — blocked on data accumulation: ≥5 guided and ≥5 unguided compaction events required per ADR-005 criteria.
