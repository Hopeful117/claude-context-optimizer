# ADR-004 — User-Controlled Compaction Intelligence

- Status: **Accepted**
- Date: 2026-11-17
- Supersedes: —
- Related: ADR-003 (Advisory-first), ES-009 (Cache Optimization Feasibility), ES-010 (Guided Compaction Prototype)

---

## Context

ES-009 established that the only available lever for influencing compaction quality is the `session.compact` hook and its `instructions` parameter — direct cache control is not accessible from the Mod.

ES-010 validated hypothesis H1: augmented `instructions` passed to `next(event)` reach the summarizer and produce a structurally distinct output aligned with the `PRESERVATION_TEMPLATE`. The prototype is opt-in (`guideEnabled` toggle, manual trigger only).

ES-011 extends the prototype to the `auto` trigger (engine-initiated compaction). This requires an explicit architecture decision because:

1. **ADR-003** mandates that automatic actions on the session require an ADR and explicit user consent before implementation.
2. The `auto` trigger fires without a user action — the consent model is therefore different from `manual`.
3. `precompute` (deferred cache-warming compaction) has no visible user-facing moment and cannot receive meaningful per-event consent.

---

## Decision

### Trigger policy

| Trigger | Guidance injection | Opt-in mechanism |
|---|---|---|
| `manual` (/compact command) | YES | `guideEnabled` toggle |
| `plugin` ($.session.compact()) | YES | `guideEnabled` toggle |
| `auto` (engine threshold) | YES | `autoGuideEnabled` toggle (separate) |
| `precompute` (deferred cache) | NO | Excluded — no user-visible moment |

The `auto` trigger is controlled by a **separate toggle** (`autoGuideEnabled`) rather than sharing `guideEnabled`. This preserves the distinction between:
- explicit user action (manual `/compact`) — `guideEnabled`
- implicit engine action (threshold-based auto-compaction) — `autoGuideEnabled`

Both toggles default to `false`. Both reset to `false` on `session.start` and `session.end`.

### Instruction composition

`composeInstructions(existing?: string)` from `src/guide/instructions.ts` is used for all guided triggers. The function is unchanged: existing instructions appear first, the template is appended, `MAX_COMPOSED_LENGTH = 2000` applies.

### Fail-open invariant

Any error in guidance injection (atom read failure, composition error) must fall back to passing the original event unchanged. This invariant applies to all guided triggers.

### Status line

| State | Status line |
|---|---|
| `manual` or `plugin` with guidance | `ctx:guided-compacted(manual)` |
| `auto` with `autoGuideEnabled` | `ctx:guided-compacted(auto)` |
| Any trigger, guidance off or error | `ctx:compacted(<trigger>)` |

### Privacy invariant

Guidance injection reads only `paneAtom.guideEnabled` and `paneAtom.autoGuideEnabled` — boolean flags. No conversation content, no message text, no tool output is read, stored, or transmitted. This is consistent with ADR-002.

---

## Consequences

- Two independent toggles in the pane UI, both disabled by default.
- `PaneSnapshot` shape bumped to `pane-3` to clear stale state safely.
- `precompute` remains permanently excluded until a consent model for deferred cache operations is defined in a future ADR.
- `MAX_COMPOSED_LENGTH` remains a compile-time constant. Making it configurable is deferred to a future story if the prototype proves insufficient.

---

## Alternatives considered

**Single toggle for all triggers:** Simpler UI, but conflates explicit user action with implicit engine action. Rejected — ADR-003 requires distinct consent for automatic actions.

**Auto trigger disabled permanently:** Conservative, but discards the most frequent compaction trigger in long sessions. Rejected — the prototype has validated the mechanism; opting in to `auto` is a reasonable next step.

**Configurable template:** Deferred — the prototype objective is to validate viability, not to build a configuration surface. If comparative evaluation shows insufficient quality, template refinement is the next lever.
