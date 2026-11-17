# ADR-004 — User-Controlled Compaction Intelligence

- Status: **Proposed**
- Date: 2026-11-17
- Relates to: ADR-001, ADR-002, ADR-003, ES-009

---

## Context

The Context Advisor V1 (v0.8.0) is a read-only tool: it observes, analyzes, and recommends. It cannot influence what Claude Code preserves when it compacts the conversation.

ES-009 (Cache Optimization Feasibility) concluded **CONDITIONAL GO** on compaction lifecycle intelligence. Its key finding: the most actionable lever available to a Mod is `session.compact` hook interception, specifically augmenting `event.instructions` to bias the summarizer toward preserving structured task state. This is the only confirmed write-path mechanism within the Mod constraint that may improve context continuity after compaction.

This ADR defines the architecture for a minimal, user-controlled prototype that experiments with guided compaction. It does not implement any production feature and does not start ES-010.

**Primary objective:** Improve Context Continuity — preserve the information needed to resume work effectively after compaction.

**Secondary objective:** Study observable effects on token consumption, cache recovery, and task-resumption quality.

**Explicit non-objective:** This is not a cache optimization in the classic sense. Compaction instructions cannot prevent the post-compaction cache miss (the context is rebuilt from scratch). They can only influence what the summarizer keeps, which may — hypothesis only — accelerate cache recovery by producing a more stable post-compaction prefix.

---

## Decision Drivers

1. ADR-003 prohibits automatic modification of context; the prototype must respect explicit user consent at every step.
2. ADR-001 requires Mod-only integration; no backend, no extra LLM calls.
3. ADR-002 prohibits collecting prompt bodies, code, or secrets; the Mod must not log or analyze conversation content.
4. The SDK confirmation from ES-009 establishes `session.compact` hook interception as technically viable.
5. ADR-003 §3 permits future write/action capability via "its own ADR, permissions model, rollback strategy, and acceptance criteria" — this ADR is that decision.
6. We must distinguish: (a) what the SDK supports, (b) what has been validated in a live session, (c) what remains hypothesis.

---

## SDK Capabilities — Confirmed vs Hypothesis

### Confirmed (verified against `claude-code.d.ts` engine 2.1.325)

| Capability | Evidence |
|---|---|
| `session.compact` hook fires for `manual`, `auto`, `plugin`, `precompute` | Type: `SessionCompactTrigger = 'manual' \| 'auto' \| 'plugin' \| 'precompute'` |
| `event.instructions` can be rewritten via `next({ ...e, instructions })` | Type docs: "changes what the summarizer is told" |
| `event.trigger` is pinned — cannot be changed | Type docs: "Pinned: `next(e)` passes it on as received" |
| `event.agentId` is pinned — cannot be changed | Type docs: "Pinned: left out of a rewrite it is put back, changed it fails the hook" |
| `SessionCompactSkipped` can veto with a `skip` string | Type: `SessionCompactResult = SessionCompacted \| SessionCompactSkipped` |
| `precompute` result is cached, not immediately applied | Type docs: "its result is kept for the next compaction, if the conversation still holds what it ran over" |
| `result.tokensBefore`, `result.tokensAfter`, `result.usage` are observable | Type: `SessionCompacted` |
| A hook returning `{ skip: "reason" }` vetoes the compaction | Type: `SessionCompactSkipped.skip: string` |

### Validated in live session (ES-005, ES-006, ES-008)

- Current `session.compact` handler calls `next(event)` first (observational, not intercepting instructions).
- Hook chain is reliable under normal conditions; fail-open behavior with `$.ui.status` protection validated.
- Post-compaction: `context.tokens`, `context.percent`, `apiUsage` correctly null; `context.window` preserved.

### Hypothesis (not yet validated in a live session)

| Hypothesis | Risk if wrong |
|---|---|
| H1: Augmented instructions reliably reach the summarizer (not silently dropped) | Prototype produces no effect |
| H2: Structured preservation instructions improve post-compaction task resumption | Primary objective fails; no benefit measured |
| H3: Better preserved state produces more cache-stable post-compaction prefix | Secondary objective fails; cache benefit absent |
| H4: `auto` trigger fires before `precompute` has been applied; intercepting `auto` has the same semantics as intercepting `manual` | Unexpected behavior on `auto` trigger |

**H1–H3 are the core validation targets of ES-010.**

---

## Options Considered

### Option 1 — Passive interception: augment instructions on every compaction

Intercept all compaction triggers. When enabled, append preservation instructions to `event.instructions` on every compaction (manual, auto, plugin, precompute).

**Pros:** Maximum coverage; works automatically once enabled.

**Cons:**
- `auto` trigger is not user-initiated — augmenting it silently modifies a system-decided compaction. This is inconsistent with ADR-003's consent model.
- `precompute` has deferred semantics: the result is cached for a later compaction. Instructions augmented at precompute time may not reflect the conversation state at actual compaction time. Consent at precompute != consent at the moment of application.
- Complexity of reasoning about all four triggers simultaneously.

### Option 2 — Selective interception: only `manual` and `plugin` triggers

Intercept only compactions the user explicitly initiated (`manual` = `/compact` command) or the Mod itself triggered (`plugin`). Skip `auto` and `precompute`.

**Pros:**
- Clear consent model: the user typed `/compact` or pressed a compact button, which is an explicit action.
- Avoids the deferred-semantics problem of `precompute`.
- Avoids silent intervention on `auto`.
- Simpler to reason about and test.

**Cons:**
- Coverage is narrower: `auto` compactions (the most frequent in long sessions) are not affected.
- If the user rarely uses `/compact` manually, the prototype sees few compaction events.

### Option 3 — Interception of `manual`, `auto`, and `plugin`; skip `precompute`

Extends Option 2 to include `auto`. When session-scoped guidance is enabled, treat `auto` trigger as covered by the user's earlier session-level consent (they enabled the feature for the whole session).

**Pros:** Wider coverage; session-scoped consent is a reasonable model for `auto`.

**Cons:**
- Relies on a session-level consent frame: user enabled the feature at session start, not at the moment of `auto` compaction. This is an interpretation of ADR-003's spirit, not its letter.
- Adds reasoning complexity vs. Option 2.

### Option 4 — No interception; advisory only

Display "compact now" recommendations with a suggested `/compact` command the user can type. No hook modification.

**Pros:** Zero risk; no consent issues; pure advisory.

**Cons:** Already available in V1 via `contextFillRule`. This option adds no new information to the prototype question ("does augmented instruction help?").

---

## Proposed Decision

**Adopt Option 2 for the first prototype, with an opt-in path to Option 3.**

Rationale:
1. Option 2 provides a clear, unambiguous consent model: the user's `/compact` command is explicit authorization for that specific compaction.
2. `precompute` is excluded because its deferred semantics make consent attribution non-trivial; this is a blocking validation point that should be resolved before including it.
3. `auto` trigger is excluded in the first prototype because it represents a system-decided action. The session-level consent argument (Option 3) is reasonable but should be a deliberate step after Option 2 is validated.
4. Option 4 adds no learning; the value of this prototype is precisely to test whether augmented instructions help.

**ADR-003 compatibility:**
ADR-003 prohibits "automatic compaction, session reset, handoff execution, prompt rewriting, or tool interception in V1." This prototype does not trigger automatic compaction. It intercepts a compaction that is **already happening** (user-initiated). Augmenting `instructions` on a user-initiated compaction, with explicit opt-in, is consistent with ADR-003's advisory-first model: the user decided to compact; the Mod guides what to preserve. This is an extension of the advisory role, not a replacement of user authority.

**However**: ADR-003 also says "any future write/action capability needs its own ADR." This ADR is that decision. The prototype remains within ADR-003's framework by requiring both the user to opt in to the feature AND to initiate each compaction manually.

**No modification of ADR-003 is required**, but its scope implicitly extends: guided compaction instructions on user-initiated compactions are now explicitly in scope for experimentation, subject to the consent model defined here.

---

## Architecture

### Component Responsibilities

```
┌─────────────────────────────────────────────────────┐
│                 session.compact hook                  │
│                 (hooks/register.tsx)                  │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              CompactionPolicy                        │
│  - Is guidance enabled? (config flag)               │
│  - Is this trigger covered? (manual | plugin only)  │
│  - Return: proceed | skip                           │
└────────────────────┬────────────────────────────────┘
                     │ proceed
                     ▼
┌─────────────────────────────────────────────────────┐
│          PreservationInstructions                    │
│  - Compose augmented instructions string            │
│  - Input: existing event.instructions (may be null) │
│  - Output: composed string                          │
│  - Static template only; no LLM calls; no content  │
│    analysis; no access to messages                  │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│          CompactionHookAdapter                       │
│  - Call next({ ...event, instructions: composed })  │
│  - On any error: call next(event) unchanged         │
│  - Collect observable metrics from result           │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│          ExperimentalMetrics                         │
│  - Record: trigger, tokensBefore, tokensAfter,      │
│    summarizer usage, instructions length, timestamp │
│  - Never record: instructions content, messages,    │
│    or any conversation content                      │
└─────────────────────────────────────────────────────┘
```

**Note**: This is a logical decomposition. The implementation does not need four separate files or classes. A single gated block inside the existing `session.compact` handler is sufficient for the prototype, as long as the separation of concerns is respected in the code.

### Sequence Diagram

```
User types /compact
       │
       ▼
SDK fires session.compact(event) where event.trigger = 'manual'
       │
       ▼
  compactionGuide.enabled?  ──no──► next(event) [unchanged]
       │ yes
       ▼
  trigger ∈ { manual, plugin }? ──no──► next(event) [unchanged]
       │ yes
       ▼
  compose instructions:
    existing = event.instructions ?? ""
    template = PRESERVATION_TEMPLATE
    composed = existing
      ? existing + "\n\n---\n" + template
      : template
       │
       ▼
  try { result = await next({ ...event, instructions: composed }) }
  catch { result = await next(event) [original — fail open] }
       │
       ▼
  record metrics (non-content only):
    trigger, tokensBefore, tokensAfter, usage, instructionsLength
       │
       ▼
  return result
```

### Static Preservation Template

The template is a fixed string, defined at compile time. It is NOT generated dynamically from conversation state. It does NOT call any API. It guides the summarizer's priorities without analyzing the conversation itself.

```
Preservation priorities for this summary:
1. Active task: the specific goal or question the user is currently working toward.
2. Work state: what is complete, what is in progress, what is blocked.
3. Key decisions: technical choices made and the reason behind each.
4. Technical constraints: requirements, acceptance criteria, and known invariants.
5. Relevant files: exact file paths and components being actively modified.
6. Open questions: unresolved issues the user must still address.
7. Next steps: the immediate actions planned before this compaction.

Prioritize stable, factual state over ephemeral observations or one-off tool outputs.
```

This template is a suggestion, not a command. The summarizer may or may not follow it. That variance is part of what ES-010 evaluates.

### Configuration

The prototype is controlled by a single boolean flag in the Mod's plugin state:

```typescript
type CompactionGuideConfig = {
  enabled: boolean;  // default: false
};
```

The user enables it via an explicit mechanism (to be defined in ES-010 — a slash command, a pane button, or a config entry). It applies to the current session. It does not persist across sessions without an explicit re-enable (session-scoped consent is the safer default for a prototype).

**The flag MUST default to `false`.** No behavior change without explicit opt-in.

---

## Consent and Safety Model

### What requires explicit user consent

| Action | Consent required | Form |
|---|---|---|
| Enable guidance for the session | YES | Explicit opt-in (slash command or pane action) |
| Each intercepted `/compact` | Implicitly covered | The `/compact` command itself is the action |
| Each `auto` compaction (Option 3 path) | Session-level consent | Requires enabling the feature; clearly communicated at activation |
| Modifying `precompute` | NOT COVERED by this ADR | Excluded from prototype scope |

### What the prototype MUST NOT do

| Prohibition | Reason |
|---|---|
| Enable itself automatically | ADR-003 §2; must not alter context without user authorization |
| Trigger `$.session.compact()` autonomously | ADR-003 §2 |
| Replace existing `event.instructions` | Silently overriding user-provided instructions is a trust violation |
| Read or log `event.messages` | ADR-002; conversation content must not be accessed for this feature |
| Log the composed instructions string | May contain user-provided instructions from `/compact <text>` |
| Veto any compaction with `{ skip }` | The Mod has no authority to prevent a compaction |
| Fire silently with no indicator | User must be able to tell guidance is active |

### Fail-open requirement

If the instruction composition raises an exception, or if `next()` with the modified event fails:

```
catch (err) {
  // Discard composed instructions; pass original event unchanged.
  // Log the error class only (not the content).
  return next(event);
}
```

**Important limitation**: fail-open protects against errors in instruction composition. It does NOT protect against `next(event)` itself failing — that failure propagates regardless of whether instructions were modified. This is an SDK-level constraint, not a Mod design flaw. The prototype should document this clearly but cannot solve it.

### Indicators

When guidance is active, the pane must clearly indicate this. Options (to be finalized in ES-010):
- Status line: `ctx:guided` instead of `ctx:ok` during active guidance sessions
- Pane field: "Compaction guidance: active"

---

## Compaction Instruction Strategy

### Composition rules

| Case | Rule |
|---|---|
| `event.instructions` is absent | Use template only |
| `event.instructions` is present | Existing instructions first, separator, then template |
| Composed string exceeds 2000 chars | Truncate template (not existing instructions); log truncation as a metric |
| Template produces empty string (bug) | Use original `event.instructions` unchanged |

**Priority**: existing instructions are always preserved verbatim and placed first. The template is additive, never substitutive.

### Template constraint

The template must be:
- Static (no dynamic content, no session state injected)
- Deterministic (same output on every call)
- Short enough to leave room for existing instructions (target: ≤ 400 chars)
- Not a data sink (no context extracted from the conversation by the Mod)

The template is a **summarizer directive**, not a **data extraction mechanism**. The Mod does not analyze the conversation; it tells the summarizer what to prioritize.

---

## Evaluation Protocol

### Experimental groups

**Group A — Baseline**: Standard Claude Code compaction behavior. No Mod guidance active (default).

**Group B — Guided**: Mod guidance enabled by user. `/compact` intercepted; preservation template appended.

### Task structure

Comparable sessions (same task type, similar complexity, similar turn count before compaction). Suggested task types:
- Multi-file refactoring with multiple decisions taken before compaction
- Bug investigation with file paths and hypotheses in context
- Feature implementation with acceptance criteria in context

### Primary metrics (manual evaluation)

| Metric | Method |
|---|---|
| Resumption quality: active task preserved | Inspect first N turns after compaction |
| Resumption quality: key decisions preserved | Inspect post-compaction summary message |
| Corrections needed after compaction | Count explicit "as I mentioned before" or re-explains |
| Turns to effective resumption | First turn where the agent correctly references prior context |

### Secondary metrics (observable)

| Metric | Source |
|---|---|
| `tokensBefore`, `tokensAfter` | `SessionCompacted` result |
| Summarizer `usage` (model, tokens) | `SessionCompacted.usage` |
| Turns to `cache_read_ratio > 30%` | Turn-by-turn metric from existing history |
| `cache_read_input_tokens` per turn post-compaction | `event.usage` on `turn.complete` |

### Anti-bias protocol

- Run Group A and Group B on the same day with the same task description.
- Assess resumption quality before looking at token metrics.
- Use at minimum 3 compaction events per group before drawing conclusions.
- Do not use post-compaction cache read ratio as the sole success criterion (see L5 below).

### Abandonment criteria

Stop the prototype if, after 5 or more compaction events across both groups:
- No observable difference in primary metrics between Group A and Group B.
- Guided compactions produce longer summaries without better content (tokens higher, quality unchanged).
- Instructions are silently dropped (H1 fails).

---

## Risks and Mitigations

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| R1: Template ignored — summarizer does not follow guidance | Medium | High (objective fails) | Validate H1 as first ES-010 test; treat as a blocking finding |
| R2: Over-long summary — template causes unnecessarily verbose output | Medium | Medium | Monitor `tokensAfter`; add a "be concise" directive to template if confirmed |
| R3: Over-rigid template — same 7 categories regardless of task type | Low | Low | Static template is a first approximation; evaluate in ES-010 |
| R4: Cost increase — summarizer produces longer summaries | Medium | Low (acceptable for prototype) | Measure `usage` per compaction; set threshold for concern |
| R5: Contradictory instructions — user passes conflicting `/compact <text>` | Low | Medium | Existing instructions placed first; template is additive |
| R6: Silent modification of `auto` compactions | Medium | High | Excluded from first prototype (Option 2); revisit only after validation |
| R7: SDK incompatibility — future SDK version changes `instructions` semantics | Unknown | High | Use only documented API; document SDK version pinned (2.1.325) |
| R8: No measurable benefit | Medium | High (product risk) | Pre-define abandonment criteria before starting ES-010 |
| R9: Confusion between context continuity and cache optimization | Medium | Medium | Document distinction explicitly; primary metric is task resumption, not cache ratio |
| R10: `precompute` auto-applying stale instructions | Low | Medium | Excluded from prototype; left for future ADR |
| R11: `next()` failure cannot be caught by fail-open pattern | Certain | Low (inherent SDK constraint) | Document; not a solvable problem at Mod layer |

---

## Consequences

### If adopted

- ES-010 can implement the prototype with a clear architecture contract.
- The prototype is explicitly scoped to `manual` and `plugin` triggers, with a documented path to extend to `auto` after validation.
- The pane gains a "guidance active" indicator for user transparency.
- A metrics schema (non-content) is defined and collectable.
- ADR-003 is not modified but is extended: guided instructions on user-initiated compactions are now a sanctioned experiment.

### If rejected

- Context Continuity remains a user responsibility only (manual `/compact` with custom text).
- ES-010 is scoped to observability improvements only (model-change detection, instruction file tracking, post-compaction windowing from ES-009 §8).

### What this architecture does NOT decide

- Whether ES-010 ships to any user other than the developer.
- Whether the prototype is ever enabled by default.
- Whether `auto` or `precompute` triggers are eventually included.
- The exact UX for opt-in activation (slash command, pane button, config file — to be decided in ES-010).

---

## Open Questions

| # | Question | Blocking? | Resolution path |
|---|---|---|---|
| OQ-1 | Do augmented instructions reliably reach the summarizer? (H1) | YES for ES-010 | First test in ES-010; validate before measuring quality |
| OQ-2 | Does `precompute` store instructions and replay them unchanged later? | YES before including `precompute` | Read SDK type docs more carefully; test in live session |
| OQ-3 | What is the exact opt-in UX? (slash command, pane action, config?) | NO — design in ES-010 | Low-risk design decision |
| OQ-4 | Should session-level guidance persist across `/clear` or only within the session? | NO — start with no-persist | Conservative default; revisit in ES-010 |
| OQ-5 | Can `agentId`-scoped compactions be intercepted? (subagent compactions) | NO for first prototype | Exclude; `agentId` is pinned and present on subagent compactions |

**OQ-1 is the only hard blocking validation point for ES-010.** All other questions can be answered during implementation.

---

## ES-010 Entry Criteria

Before starting ES-010, the following must be true:

1. This ADR is accepted (human validation).
2. The existing `session.compact` hook is not intercepting `instructions` today (confirmed: current handler calls `next(event)` without modification — verified in `hooks/register.tsx:302`).
3. No pending changes to `hooks/register.tsx` that would conflict (clean main branch).
4. A minimal opt-in activation mechanism is designed (slash command or pane action — to be scoped in ES-010 planning).

---

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Is the prototype architecturally acceptable? | YES — passive instruction augmentation on user-initiated compactions is compatible with ADR-003 and ADR-001 |
| D2 | Activation mode | Explicit opt-in per session; default disabled; no silent activation |
| D3 | Which compactions can be modified? | `manual` and `plugin` only in first prototype; `auto` excluded; `precompute` excluded |
| D4 | How are instructions built? | Static template appended after existing instructions; no LLM calls; no conversation analysis |
| D5 | How are existing instructions respected? | Existing instructions placed first, unchanged; template is additive only |
| D6 | Behavior on error | Fail-open: pass original `event` unchanged; log error class only |
| D7 | What data may be retained? | Trigger, tokensBefore, tokensAfter, summarizer usage, instructions length (boolean + char count), timestamp. Never: instructions content, message content, summary content |
| D8 | How is effectiveness measured? | Primary: manual task resumption assessment. Secondary: post-compaction cache metrics from existing history |
| D9 | Abandonment criteria | No measurable difference in resumption quality after 5+ compaction events across both groups; H1 failure (instructions silently dropped) |
| D10 | ES-010 entry conditions | ADR accepted; existing hook confirmed unmodified; opt-in UX scoped |

---

## Recommendation

**CONDITIONAL GO**

The architecture is sound and minimal. The consent model is explicit. The risks are proportionate for a guarded prototype. The key unknowns (H1–H3) are precisely the ones ES-010 must answer; they cannot be answered without building the prototype.

Conditions:
1. This ADR is accepted as written.
2. OQ-1 (instruction delivery validation) is the first test in ES-010, before any quality or cache measurement.
3. `auto` and `precompute` triggers remain excluded until Option 2 is validated.
4. The flag defaults to `false` and is never flipped automatically.

---

## Appendix — ES-010 Scope Proposal

### ES-010 — Guided Compaction Prototype

**Objective**: Validate whether structured preservation instructions on user-initiated compactions measurably improve context continuity after compaction.

**Minimal scope**

1. Config flag `compactionGuide.enabled` (boolean, default `false`) in plugin state.
2. Explicit opt-in mechanism: one command or pane action to enable for current session.
3. `session.compact` hook extension: intercept `manual` and `plugin` triggers; compose and pass augmented instructions.
4. Static preservation template (as defined in this ADR).
5. Pane indicator: show "guidance active" when enabled.
6. Metrics collection: `trigger`, `tokensBefore`, `tokensAfter`, `usage`, `instructionsLength` (never content).

**Out of scope for ES-010**

- `auto` trigger interception (excluded by this ADR for first prototype)
- `precompute` trigger interception
- Dynamic instruction generation from conversation state
- Any LLM call for instruction generation
- Persistent guidance across sessions (session-scoped only)
- UI redesign

**Acceptance criteria**

| # | Criterion | Automated |
|---|---|---|
| AC-1 | Flag defaults to `false`; no behavior change without opt-in | Test (unit) |
| AC-2 | On `manual` trigger with guidance enabled: `instructions` passed to `next()` contains template | Test (unit, mock hook) |
| AC-3 | On `auto` trigger with guidance enabled: `instructions` passed unchanged | Test (unit) |
| AC-4 | On `precompute` trigger: `instructions` passed unchanged regardless of flag | Test (unit) |
| AC-5 | When `event.instructions` is present: existing instructions appear first in composed string | Test (unit) |
| AC-6 | On error in composition: `next(event)` called with original event | Test (unit) |
| AC-7 | Pane shows guidance-active indicator when enabled | Manual |
| AC-8 | No conversation content (instructions string, messages) logged or stored | Code review |
| AC-9 | All existing tests pass unchanged | Test suite |
| AC-10 | TypeScript compilation has no new errors | `tsc --noEmit` |

**Validation protocol**

Manual: Run equivalent tasks in Group A (no guidance) and Group B (guidance enabled). Assess resumption quality before reviewing token metrics. Minimum 3 compaction events per group.

First test before any quality measurement: confirm H1 — does `event.instructions` modification reach the summarizer? (Inspect the first post-compaction summary message for signs of template influence.)

**Go/No-Go conditions**

- GO: H1 confirmed; primary metrics show improvement in at least 2 of 3 compaction events in Group B.
- NO-GO: H1 fails (instructions silently dropped); or no measurable difference after 5 events; or summarizer produces longer summaries without better content.
- CONDITIONAL GO: H1 confirmed but quality improvement is marginal — refine template before extending to `auto` trigger.
