# ES-016 — Comparative Evaluation Readiness

- Status: **Gate 1 — Awaiting Human Approval**
- Date: 2026-11-18
- Branch: `feat/es-016-comparative-evaluation-readiness`
- Base: `main` (v1.0.4 — ES-015 merged, `cb33442`)
- Version target: none (documentary story — no code changes expected)

---

## Objective

Prepare a credible, actionable, and privacy-compatible comparative evaluation methodology for guided compaction.

The plugin now has automated data collection infrastructure (ES-014/ES-015). No comparative improvement has yet been demonstrated. This story defines the methodology needed to draw defensible conclusions from the data that will accumulate, and identifies the gaps in the current ADR-005 criteria.

**This story is primarily documentary.** No new features are introduced without demonstrated technical necessity and human validation.

---

## Background

- ES-013 stabilized the guidance injection mechanism.
- ES-014 introduced `evalAtom` (bounded log, 200 entries) with one entry per compaction event.
- ES-015 corrected signal semantics (`turnsUntilAnnotation`, `dismissed` vs `skipped`).
- ADR-005 defines Go/No-Go criteria based on a 60% positive annotation rate threshold in the guided group with ≥5 annotated events.

The current ADR-005 criteria are sufficient to detect user satisfaction in the guided group but insufficient to demonstrate comparative improvement over the unguided group. See the Repository Analysis for detailed findings.

---

## Scope

### In scope

1. Audit of ADR-005 Go/No-Go methodology and its limits.
2. Definition of a comparative decision grid (GO / CONDITIONAL GO / NO-GO / INSUFFICIENT EVIDENCE).
3. Precise definition of annotation rate metrics (response rate, satisfaction rate, dismissal rate, missing data rate).
4. Assessment of group comparability (Group A vs Group B variables).
5. Lightweight qualitative protocol for context continuity assessment.
6. Data access strategy for `evalAtom` contents.
7. Experimental protocol for real-world use.
8. Results template (empty — no data fabricated).
9. ADR-005 amendment proposal (pending human approval).

### Out of scope

- Compaction template modifications.
- New compaction triggers.
- New automatically collected metrics.
- LLM calls of any kind.
- Backend, database, or remote telemetry.
- Analytics dashboard.
- Handoff implementation.
- Context Orchestrator.
- Any verdict on guided compaction effectiveness (no data yet).

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | Limits of current ADR-005 criteria are documented |
| AC-2 | Comparative decision grid defined (GO / CONDITIONAL GO / NO-GO / INSUFFICIENT EVIDENCE) |
| AC-3 | Annotation metrics mathematically and semantically defined |
| AC-4 | Missing data handling documented |
| AC-5 | Group A vs Group B comparability analyzed without misleading conclusions |
| AC-6 | Experimental protocol is reproducible |
| AC-7 | Remaining runtime validations identified |
| AC-8 | Realistic data access method documented |
| AC-9 | Results template ready (empty) |
| AC-10 | ADR-005 and evaluation documents are consistent |
| AC-11 | No unnecessary new infrastructure introduced |

---

## Workflow Documents

- **Repository Analysis**: `docs/stories/ES-016-repository-analysis.md` ✅
- **Implementation Plan**: `docs/stories/ES-016-implementation-plan.md` (pending Gate 1 approval)
- **Engineering Report**: `docs/stories/ES-016-engineering-report.md` (pending Gate 2 approval)
- **Comparative Evaluation Protocol**: `docs/investigations/ES-016-comparative-evaluation-protocol.md` (pending Gate 2 approval)
- **Evaluation Results Template**: `docs/investigations/ES-016-evaluation-results-template.md` (pending Gate 2 approval)
