# ES-016 — Engineering Report

- Story: `docs/stories/ES-016-comparative-evaluation-readiness.md`
- Date: 2026-11-18
- Branch: `feat/es-016-comparative-evaluation-readiness`
- Version: none (documentary story — no version bump)
- Status: **Complete**

---

## Summary

ES-016 prepares the comparative evaluation methodology for guided compaction. No new code was introduced. The deliverables are documentation: a revised ADR-005 decision grid, formal metric definitions, a reproducible evaluation protocol, and an empty results template.

---

## ADR-005 Limits Identified

The repository analysis (`ES-016-repository-analysis.md`) identified five methodological gaps in the ADR-005 (amended ES-015) criteria:

| Gap | Description |
|---|---|
| Absolute threshold without baseline | 60% GO threshold applied to guided group only — unguided could score higher and still trigger GO |
| No INSUFFICIENT EVIDENCE state | Three-outcome grid forced premature verdicts with inadequate data |
| Response rate invisible | High `skipped` rate not visible in criteria; small non-representative sample could produce GO |
| `precompute` skew | `precompute` entries always in Group A (cannot be guided), distorting group sizes |
| Dismissal ambiguity | `dismissed` counted in denominator without its own rate, mixing "noticed but declined" with "rated" |

---

## New Comparative Decision Grid

Defined in `docs/stories/ES-016-implementation-plan.md` §D1 and enacted in ADR-005 §Amendment-2.

| Verdict | Key criteria |
|---|---|
| **GO** | B satisfaction > A satisfaction AND B ≥ 50%, ≥5 annotated/group, comparable triggers |
| **CONDITIONAL GO** | Positive trend but: sample < 5, incomparable groups, response_rate < 40%, or contradictions |
| **NO-GO** | B satisfaction ≤ A satisfaction after ≥10 annotated/group, comparable samples |
| **INSUFFICIENT EVIDENCE** | < 5 annotated in either group, response_rate < 20%, or incomparable triggers |

**Confidence qualifiers:** Exploratory (5–14/group) / Indicative (≥15/group) / Not assessable.

---

## Metric Definitions

Formally defined and enacted in ADR-005 §5:

| Metric | Formula |
|---|---|
| `response_rate` | `(positive + negative + dismissed) / total_entries` |
| `satisfaction_rate` | `positive / (positive + negative + dismissed)` |
| `dismissal_rate` | `dismissed / (positive + negative + dismissed)` |
| `missing_rate` | `skipped / total_entries` |

Semantic constraint: `dismissed` and `skipped` are never counted as negative. Reports must show absolute counts alongside percentages.

---

## Group Comparability

Identified in `ES-016-repository-analysis.md` §5. Key findings:

- `trigger` is directly available in `evalAtom` and is the primary stratification variable.
- `precompute` entries always land in Group A and must be excluded before computing rates.
- No shared identifier between `evalAtom` and `historyAtom` — cross-atom joins are not reliable; analysis must be conducted on `evalAtom` alone.
- If trigger distributions differ > 40pp between groups, use trigger-stratified subsets rather than pooled results.

---

## Qualitative Protocol

A lightweight, voluntary check for a small number of compactions (≤5 total) defined in `docs/investigations/ES-016-comparative-evaluation-protocol.md`. Checks five continuity dimensions (objective, decision, constraint, file, re-statement cost) without reading conversation content. Results are supplementary — they do not gate the verdict.

---

## Data Access Strategy

**Recommended: Option A (manual observation).** The evaluation period requires only aggregate counts, which can be tracked manually using the results template. No code change required.

**Future option (not in ES-016):** Option B — an in-pane aggregate summary display (read-only). To be considered as a future story if data volume justifies it.

**Deferred:** Option C — user-triggered export. Requires a data-flow ADR before implementation.

---

## Remaining Runtime Validations

Ten MRV items (MRV-006 through MRV-ES015-5) from ES-014/ES-015 remain unconfirmed in a live Claude Desktop session. These are prerequisites to trusting the evaluation dataset. They are documented in `ES-016-repository-analysis.md` §7 and `ES-016-comparative-evaluation-protocol.md` §Prerequisites.

---

## Modified Files

| File | Type | Change |
|---|---|---|
| `docs/architecture/ADR-005-evaluation-data-policy.md` | Modified | §5 revised: comparative grid, metric definitions, `INSUFFICIENT EVIDENCE` state, `precompute` exclusion, confidence qualifiers, display requirement; §Amendment-2 appended |
| `docs/stories/ES-016-comparative-evaluation-readiness.md` | New | Story objective, scope, AC |
| `docs/stories/ES-016-repository-analysis.md` | New | Audit: evalAtom, ADR-005 limits, group comparability, MRV status, data access options |
| `docs/stories/ES-016-implementation-plan.md` | New | Decision grid, metric definitions, comparability protocol, qualitative protocol, data access strategy, ADR-005 amendment proposal |
| `docs/investigations/ES-016-comparative-evaluation-protocol.md` | New | Reproducible protocol: prerequisites, collection guidance, analysis procedure, verdict rendering |
| `docs/investigations/ES-016-evaluation-results-template.md` | New | Empty results template: raw counts, computed metrics, comparability, qualitative, verdict |
| `docs/stories/ES-016-engineering-report.md` | New | This document |

---

## ADR Compliance

| ADR | Status |
|---|---|
| ADR-001 — fail-open, `next()` always called | ✅ No code changes |
| ADR-002 — no conversation content stored | ✅ No new data collection |
| ADR-003 — deterministic recommendations, no LLM | ✅ No LLM calls; advisor untouched |
| ADR-004 — no automatic compaction | ✅ No new triggers |
| ADR-005 — evaluation data policy | ✅ Amended by ES-016 with human approval |

---

## Quality Results

No code was modified. TypeScript compilation and test suite were not re-run (no production files changed). The 180-test baseline from ES-015 remains valid.

---

## Acceptance Criteria Status

| # | Criterion | Status |
|---|---|---|
| AC-1 | Limits of current ADR-005 criteria documented | ✅ ES-016-repository-analysis.md §3 |
| AC-2 | Comparative decision grid defined | ✅ Implementation Plan §D1, ADR-005 §5 amended |
| AC-3 | Annotation metrics mathematically and semantically defined | ✅ Implementation Plan §D2, ADR-005 §5 amended |
| AC-4 | Missing data handling documented | ✅ `missing_rate` metric; response_rate gates; template §3 |
| AC-5 | Group A vs B comparability analyzed | ✅ Repository Analysis §5, Protocol §Comparability |
| AC-6 | Experimental protocol reproducible | ✅ ES-016-comparative-evaluation-protocol.md |
| AC-7 | Remaining runtime validations identified | ✅ Repository Analysis §7, Protocol §Prerequisites |
| AC-8 | Realistic data access method documented | ✅ Repository Analysis §6, Implementation Plan §D5 |
| AC-9 | Results template ready (empty) | ✅ ES-016-evaluation-results-template.md |
| AC-10 | ADR-005 and evaluation documents consistent | ✅ ADR-005 amended, protocol references ADR-005 §5 |
| AC-11 | No unnecessary new infrastructure | ✅ Documentary story; no code changes |

---

## Next Steps

1. **Complete runtime validations (MRV-006 through MRV-ES015-5)** in a live Claude Desktop session before treating accumulated data as reliable.
2. **Begin evaluation period** — use the plugin naturally; annotate when convenient; record incidents in the results template.
3. **Render Go/No-Go verdict** when the minimum collection target is reached (≥5 annotated events per group, excluding precompute).
4. **Consider Option B** (in-pane aggregate summary) if the evaluation period extends past 20–30 compactions and manual tracking becomes burdensome — requires a separate story and Gate 2 approval.
