# ES-010 — Guided Compaction Prototype

- Status: **Validated**
- Date: 2026-11-17
- Branch: `feat/es-010-guided-compaction-prototype`
- Base: `main` (v0.8.0 — ES-008 and ES-009 merged)
- Version: `0.9.0`

---

## Objective

Validate whether structured preservation instructions on user-initiated compactions measurably improve context continuity after compaction.

This is an **experimental prototype**, disabled by default. It must not alter any behavior without explicit user opt-in. Its primary purpose is to answer hypothesis H1 (do augmented instructions reach the summarizer?) before measuring quality or cache impact.

**Primary objective:** Improve Context Continuity.
**Secondary objective:** Observe effects on token consumption and cache recovery (secondary only — do not use cache read ratio as the sole success criterion).

Architecture authority: ADR-004 (`docs/architecture/ADR-004-user-controlled-compaction-intelligence.md`).

---

## What Was Built

### New module: `src/guide/instructions.ts`

Static preservation template and `composeInstructions()` function.

- `PRESERVATION_TEMPLATE`: 7-category static template directing the summarizer to preserve task state.
- `composeInstructions(existing?: string): string`: composes existing instructions (always first) with the template, respecting a 2000-char limit. Never truncates existing instructions.

### New test file: `src/guide/instructions.test.ts`

12 unit tests covering: undefined/empty input, existing instructions preserved first, composition within limit, truncation behavior, template content smoke test.

### Type change: `types/index.d.ts`

Added `guideEnabled: boolean` to `PaneSnapshot`. Shape bumped to `'pane-2'` to clear old state safely.

### Hook change: `hooks/register.tsx`

**`session.compact` handler**: added pre-next guidance injection:
- Reads `paneAtom.guideEnabled` before calling `next(event)`.
- If enabled AND trigger is `manual` or `plugin`: calls `next({ ...event, instructions: composeInstructions(event.instructions) })`.
- Fail-open: any error in composition falls back to `next(event)` unchanged.
- Status line: `ctx:guided-compacted(manual)` when guidance was applied; `ctx:compacted(trigger)` otherwise.

**`session.start` / `session.end` handlers**: reset `guideEnabled: false`.

**Pane render**: added "Compaction Guidance (prototype)" section with a toggle `Button`.
- `'● Active'` (primary variant) when enabled.
- `'○ Disabled'` (default) when disabled.
- `onPress` fires-and-forgets `update($, paneAtom, m => ({ ...m, guideEnabled: !m.guideEnabled }))`.

---

## Triggers Covered

| Trigger | Intercepted when guide enabled? |
|---|---|
| `manual` (/compact command) | YES |
| `plugin` ($.session.compact()) | YES |
| `auto` (engine threshold) | NO — excluded by ADR-004 for first prototype |
| `precompute` (deferred cache) | NO — excluded by ADR-004 for first prototype |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| AC-1 | Flag defaults to `false`; no behavior change without opt-in | Verified in code (atom default + session.start reset) |
| AC-2 | On `manual` trigger with guidance enabled: `instructions` passed to `next()` contains template | Unit tests in instructions.test.ts; hook logic verified |
| AC-3 | On `auto` trigger with guidance enabled: `instructions` passed unchanged | Trigger check in register.tsx:318 |
| AC-4 | On `precompute` trigger: `instructions` passed unchanged regardless of flag | Trigger check in register.tsx:318 |
| AC-5 | When `event.instructions` is present: existing instructions appear first in composed string | Unit test: "existing appears before template" |
| AC-6 | On error in composition: `next(event)` called with original event | Fail-open try/catch in register.tsx:319-322 |
| AC-7 | Pane shows guidance-active indicator when enabled | Button variant='primary', label '● Active' |
| AC-8 | No conversation content (instructions string, messages) logged or stored | Verified: no content in atom, no content logging |
| AC-9 | All existing tests pass unchanged | To be verified |
| AC-10 | TypeScript compilation has no new errors | To be verified in live session |

---

## Tests Added

- `src/guide/instructions.test.ts` — 12 unit tests for `composeInstructions` and `PRESERVATION_TEMPLATE`.

---

## Validation Protocol (H1 First)

**Step 1 — H1 validation (required before quality measurement):**

Enable guidance via the pane Button. Run `/compact`. Inspect the first post-compaction summary message in the transcript: does it show signs of the 7-category structure? If yes, H1 is confirmed. If the summary looks identical to unguided summaries, H1 may be failing.

**Step 2 — Comparative evaluation (after H1 is confirmed):**

Run equivalent tasks in two modes:
- Group A: guidance disabled (default)
- Group B: guidance enabled via pane Button, then `/compact`

Assess per ADR-004 §Evaluation Protocol: turns to effective resumption, corrections needed, key decisions preserved. Minimum 3 compaction events per group before drawing conclusions.

---

## H1 Validation Results

**Date:** 2026-11-17 — live session test with guidance toggle `● Active`.

| Criterion | Result |
|---|---|
| 7-category structure present in summary | ✅ 7/7 categories represented |
| Summary structurally different from unguided | ✅ 9 titled sections vs flat narrative; dedicated files section with exact paths |
| Status line `ctx:guided-compacted(manual)` | ✅ Confirmed in pane |

**Conclusion: H1 confirmed.** The `event.instructions` modification reaches the summarizer and produces a structurally distinct output aligned with the PRESERVATION_TEMPLATE. The prototype is viable.

**Go/No-Go decision:** CONDITIONAL GO — H1 confirmed. Quality improvement is structurally evident but comparative evaluation (Group A vs Group B, ≥3 events each) has not yet been run. Refine template if needed after comparative run.

---

## Remaining Limitations

- **Comparative evaluation pending**: H1 is confirmed but Group A vs Group B quality comparison (≥3 events each) has not yet been completed. Required before GO on extending to `auto` trigger.
- **No `auto` coverage**: The most frequent compaction trigger in long sessions is not covered by this prototype. This is intentional (ADR-004 §Proposed Decision).
- **`onPress` async**: The toggle fires-and-forgets the atom update. If `update($, paneAtom, ...)` fails silently, the Button state may not reflect reality until the next render cycle. Not a safety issue.
- **No persistent config**: Guidance resets on session start/end. This is intentional (session-scoped consent).

---

## Go/No-Go for ES-011

**Recommendation: CONDITIONAL GO** — H1 confirmed 2026-11-17. Comparative evaluation pending.

- **GO (extend to `auto` trigger):** H1 confirmed; ≥2 of 3 Group B compaction events show better resumption than Group A.
- **NO-GO (remove prototype):** H1 fails; or no measurable difference after 5 events; or summarizer produces longer summaries without better content.
- **CONDITIONAL GO (refine template):** H1 confirmed but quality improvement is marginal — refine template, then re-evaluate.

---

## Related

- ADR-004: `docs/architecture/ADR-004-user-controlled-compaction-intelligence.md`
- ES-009: `docs/investigations/ES-009-cache-optimization-report.md`
- ES-008: v0.8.0 stabilization baseline
