# Roadmap

## Phase 0 — Feasibility spike ✅ COMPLETE (ES-001, 2026-11-17)

Confirmed: Mod loads on Claude Desktop Code tab; all core metrics available; Pane surface functional. See `docs/investigations/ES-001-mod-feasibility-report.md`.

**Exit gate met:** session ID, context window/fill/tokens, cache breakdown (via `event.usage`), rate limits, cost (Desktop confirmed), `session.measure` and `session.compact` events, `$.store` persistence, Pane UI.

## Phase 1 — Context Advisor Foundations ✅ COMPLETE (ES-002–ES-007)

- **ES-002**: Bounded metrics history, concern separation (normalize / history / pane), 22 unit tests. ✅
- **ES-003**: Deterministic recommendation engine — four heuristic rules, 23 new tests, Advisor section in pane. ✅
- **ES-004**: Advisor reliability & calibration — post-compaction fix, turn/measure separation, cacheEfficiency boundary, Recommendation category, 30+ new regression tests. ✅
- **ES-005**: Runtime validation & performance — hook reliability (error containment, next(event) semantics), in-memory timing accumulator, timing tests, manual runtime validation protocol. ✅
- **ES-006**: Advisor evaluation & calibration — structured evidence model (RecommendationEvidence), post-compaction scoping for cacheEfficiencyRule, 12 new evaluation scenarios. ✅
- **ES-007**: Context Advisor UX — 3-level pane (session overview, advisor insights, diagnostics), fill trend, evidence display, Claude-brand visual theme. v0.7.0. ✅

**Exit gate met:** reproducible session history, bounded memory, negligible observer overhead, no automatic session changes, 3-level pane with fill/trend/evidence, deterministic recommendations.

## Phase 2 — Stabilization & Effectiveness ✅ COMPLETE (ES-008, ES-009)

- **ES-008**: V1 Stabilization — post-compaction display consistency (ANO-001), evidence unit formatting (ANO-002), turn counter semantics (ANO-003), hook resilience (ANO-004). v0.8.0. ✅
- **ES-009**: Cache optimization feasibility — CONDITIONAL GO. Confirmed: `session.compact` hook can augment instructions. Direct cache control not available. Best lever: compaction lifecycle intelligence. See `docs/investigations/ES-009-cache-optimization-report.md`. ✅

**Phase 2 exit gate met:** V1 behavioral correctness validated (ES-008), feasibility study complete (ES-009), Go/No-Go documented.

## Phase 3 — Compaction Intelligence

- **ADR-004**: User-Controlled Compaction Intelligence — trigger policy, two-toggle consent model (manual + auto), fail-open invariant. Status: **Accepted** (2026-11-17). ✅
- **ES-010**: Guided Compaction Prototype — passive instruction injection on user-initiated `/compact`. Toggle in pane. H1 validated 2026-11-17. v0.9.0. ✅
- **ES-011**: Auto Trigger Extension — `autoGuideEnabled` toggle, `wasGuided` history marker. v1.0.0. Code merged ✅. Manual evaluation protocol superseded by ADR-005.
- **ES-012**: Persistent Guidance Toggle State — `rememberPrefs` toggle, `prefsAtom`. v1.0.1. ✅
- **ES-013**: Guided Compaction Stabilization — ANO-001–ANO-006 fixes, `wasGuided` accuracy, compile errors, test coverage. v1.0.2. ✅
- **ADR-005**: Evaluation Data Policy — automated behavioral proxies (`evalAtom`, `turnsUntilAnnotation`, optional annotation) replace manual M1–M4 protocol. Status: **Accepted, amended ES-015** (2026-11-17). ✅
- **ES-014**: Evaluation Data Collection — `evalAtom`, annotation widget, compact history fields. v1.0.3. ✅
- **ES-015**: Evaluation Signal Reliability — `turnsToResumption` → `turnsUntilAnnotation` (accurate semantics), `'dismissed'` annotation value, ADR-005 amendment. v1.0.4. ✅
- **ES-016**: Comparative Evaluation Readiness — ADR-005 comparative decision grid, formal metric definitions (`response_rate`, `satisfaction_rate`, `dismissal_rate`, `missing_rate`), `INSUFFICIENT EVIDENCE` verdict, evaluation protocol, results template. ✅
- **ES-017**: Evaluation Data Display — in-pane read-only aggregate summary of `evalAtom` (counts per group, response rate, satisfaction rate). v1.0.5. ← _current_

**Phase 3 exit gate:** ADR-004 accepted ✅, H1 validated ✅, code stabilized (ES-013) ✅ — Go/No-Go verdict blocked on evaluation data accumulation (ES-014/ES-015/ES-016).

> **Important:** ES-011 Go/No-Go verdict requires ≥5 annotated events (positive + negative + dismissed, excluding `precompute`) per group. Verdict criteria are defined in ADR-005 (amended ES-016): Group B satisfaction rate must exceed Group A and reach ≥50%. Protocol: `docs/investigations/ES-016-comparative-evaluation-protocol.md`.

## Future — Context Orchestrator

- Structured handoff drafts and user-confirmed session transitions.
- Policy engine and audit trail.
- Optional supported integrations only after separate ADRs and user approval.
- **Not started. Requires separate ADR and product validation before any implementation.**

No dates or savings percentages are promised before measurement.
