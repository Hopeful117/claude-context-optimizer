# ES-009 — Cache Optimization Feasibility — Investigation Report

- Date: 2026-11-17
- SDK inspected: `claude-code.d.ts` — engine **2.1.325** (from `/tmp/claude-1000/bundled-skills/2.1.325/`)
- Project version: **0.8.0** (ES-008 stabilization merged to main)
- Status: **Complete**

---

## 1. Executive Summary

This investigation determines what Claude Context Optimizer can do, through the Claude Code Mod SDK, to improve prompt cache utilization.

**Main finding**: The Mod operates entirely **outside** the request-building layer. It cannot inject `cache_control` markers, modify the system prompt, change tool definitions, or control model selection. These levers belong to Claude Code's core loop, which is opaque to the Mod.

**What is available**: The Mod can observe per-turn cache metrics, detect patterns of cache degradation, correlate them with observable events (model change, compaction, session transition), provide targeted recommendations, and — most significantly — **trigger and intercept compaction** via `$.session.compact()` and the `session.compact` hook.

**Recommendation: CONDITIONAL GO** — Implement enhanced compaction lifecycle intelligence in ES-010. This is the only confirmed action lever with potential for real cache impact, but its effectiveness must be validated before committing to a full Cache Intelligence Engine architecture.

---

## 2. Prompt Caching — What Is Relevant to Claude Code

### 2.1 How Prompt Caching Works (Officially Documented)

**Source**: `shared/prompt-caching.md` from Claude API skill (cached: 2026-11-03).

Prompt caching is a **prefix-match** mechanism:

- The cache key is derived from the **exact bytes** of the rendered prompt up to each `cache_control` breakpoint.
- Render order: `tools` → `system` → `messages`.
- Any byte change at position N invalidates everything after position N.
- Minimum cacheable prefix: **512 tokens** on current models (Claude Sonnet 5.5, Opus 5.5, Fable 5.x, Haiku 5.5). Silently fails (no error) for shorter prefixes.
- TTL: **5 minutes** (default ephemeral) or **1 hour** (explicit `ttl: "1h"`).
- Cache reads: ~0.1× base price (0.05× on Opus 5.5, 0.025× on Fable 5.2).
- Cache writes: ~1.25× for 5-minute TTL, 2× for 1-hour TTL.
- Caches are **model-scoped**: a model switch = cache miss on all tiers.
- Caches are **workspace-isolated**: different Claude Code sessions that happen to share identical prompts still write separate entries.

### 2.2 Invalidation Hierarchy (Documented)

| Change | Tools cache | System cache | Messages cache |
|---|:---:|:---:|:---:|
| Tool definitions (add/remove/reorder) | ✗ | ✗ | ✗ |
| Model switch | ✗ | ✗ | ✗ |
| System prompt content | ✓ | ✗ | ✗ |
| Thinking or effort change | Model-specific | Model-specific | ✗ |
| Message content | ✓ | ✓ | ✗ |

**Key implication**: Tool and model changes are the most destructive. Any change to `tools` invalidates the entire cache. Model switches invalidate everything (caches are model-scoped).

### 2.3 Silent Invalidators (Documented)

The most common cache killers in production are:

- Dynamic content in the system prompt (timestamps, session IDs, UUIDs)
- Non-deterministic JSON serialization of tool definitions
- Conditional system sections (feature flags, user-specific instructions)
- Tool sets that vary per user or request

**For Claude Code specifically**: CLAUDE.md files are injected into the system prompt. If a CLAUDE.md changes (or is loaded from a different project directory), the system prompt changes, and the cache misses from that point. This is an observable event (the `prompt.context` hook exposes `instructionFiles`).

### 2.4 Multi-Turn Conversation Caching (Documented)

In a healthy agentic loop:

- `cache_read_input_tokens` grows turn over turn (accumulating prior turns)
- `cache_creation_input_tokens` ≈ size of the previous assistant turn + new user input
- `input_tokens` ≈ only the tail after the last breakpoint

**Post-compaction**: After `session.compact`, `context.tokens` and `context.percent` go null. The cache effectively resets: Claude Code must rebuild the cache from scratch over the next few turns. This explains why cache read ratios drop to near-zero immediately after compaction — this is **expected and normal**.

### 2.5 Claude Code's Own Caching Behavior (Hypothesis / Inferred)

The following is **inferred** from general knowledge of Claude Code + observed metric patterns. No internal Claude Code source is accessible to the Mod.

**Hypothesis H1**: Claude Code sends a stable system prompt containing the CLAUDE.md content (global + project-level), framed tool definitions, and a conversation history. It likely places `cache_control` breakpoints on the system prompt and on the growing conversation history.

**Hypothesis H2**: Each turn appends new content to the conversation history. If the system prompt is stable, the cache should accumulate turn over turn, and `cache_read_input_tokens` should be a large fraction of total input by turn 3–5.

**Hypothesis H3**: Tool definitions change when the user adds/removes MCP servers, or when Claude Code's built-in tool set changes (e.g., after an update). This would invalidate the entire cache.

**Evidence supporting H2/H3**: The `cacheEfficiencyRule` threshold of 30% cache read ratio, empirically calibrated in ES-006, sees frequent anomalies in early turns and after compaction — consistent with a system that caches aggressively once stable.

**Not confirmed**: Whether Claude Code uses explicit `cache_control` markers or auto-caching, what the exact TTL is, whether subagent calls share the same cache namespace.

---

## 3. SDK Capabilities — Verified Against claude-code.d.ts (engine 2.1.325)

### 3.1 Available Events and APIs

| Capability | SDK Surface | Available | Notes |
|---|---|:---:|---|
| Observe per-turn token breakdown | `event.usage` on `turn.complete` | **YES** | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` |
| Observe model per turn | `event.usage.model` on `turn.complete` | **YES** | Via `TurnUsage extends ModelUsage & { model: string }` |
| Observe context window fill | `$.session.usage()` | **YES** | `context.tokens`, `context.percent`, `context.window` |
| Observe compaction events | `session.compact` event | **YES** | `event.trigger` = `"manual"` / `"auto"` / `"precompute"` / `"plugin"` |
| Detect model switch | Compare `event.usage.model` turn-over-turn | **YES** | No direct "model changed" event; must track in history |
| Detect session transitions | `session.end` with `reason = 'clear' \| 'resume'` | **YES** | Currently used to reset pane/history |
| Detect instruction file changes | `prompt.context` hook + `instructionFiles` | **YES** | Fires at session start and after compaction/clear |
| Trigger compaction programmatically | `$.session.compact({ instructions? })` | **YES** | Confirmed in types; fires `session.compact` with `trigger: 'plugin'` |
| Intercept compaction to modify instructions | `session.compact` hook, rewrite `e.instructions` | **YES** | Can add preservation text before `next(e)` |
| Intercept compaction to filter messages | `session.compact` hook, rewrite `e.messages` | **YES** | Full transcript access; must pass handles unchanged for engine messages |
| Inject blocks into first user message | `prompt.context` hook | **YES** | Modifies initial user message blocks — CAUTION: destabilizes messages cache |
| Modify system prompt | Not exposed | **NO** | System prompt is built by Claude Code core, not exposed to Mods |
| Control `cache_control` markers | Not exposed | **NO** | Part of Claude Code's internal request builder |
| Control tool definitions | Not exposed | **NO** | Not part of Mod API |
| Control model selection | Not exposed | **NO** | Model is a session setting, not a Mod parameter |
| Intercept API requests before model call | No pre-call hook for main loop | **NO** | `turn.start` fires but does not expose the request being built |
| Read `breakdown.apiUsage` | `$.session.usage({ breakdown: 'summary' })` | **NO** | Returns null in Desktop Code tab (ES-001 confirmed) |
| Access conversation history | `$.session.messages()` | **YES** | But subject to ADR-003 restrictions on modification |

### 3.2 Key Finding: `$.session.compact()`

The SDK exposes `$.session.compact({ instructions? })` — a Mod can **programmatically trigger compaction** with optional preservation instructions. This fires `session.compact` with `trigger: 'plugin'`.

The `session.compact` hook receives:
- `trigger` — what initiated the compaction
- `instructions` — the text guiding the summarizer (the Mod can override this via `next({ ...e, instructions })`)
- `messages` — the full transcript being summarized (the Mod can filter, reorder, or annotate)

Result (`SessionCompacted`): `messages` (post-compaction transcript), `tokensBefore?`, `tokensAfter?`, `usage?` (ModelUsage of the summarizer call).

**Implication**: A Mod could, with user authorization, trigger compaction at an optimal moment and guide what the summarizer preserves — including context elements that would improve post-compaction cache recovery.

### 3.3 Key Finding: `prompt.context` Hook Limitations

The `prompt.context` hook can modify context blocks injected into the **first user message** of a conversation. These blocks appear in the `messages` array (not in `system`), so modifying them changes the messages cache.

**Risk**: If a Mod injects dynamic or varying content via `prompt.context`, it actively **hurts** cache stability because the messages prefix changes on every session start. Only stable, static content should be injected here.

**Opportunity**: This hook provides visibility into which CLAUDE.md files were loaded (`instructionFiles`), which is actionable information: if instruction files changed between sessions, that is a cache invalidation event that explains a cache miss.

### 3.4 Confirmed Non-Capabilities

| What was hoped | Reality |
|---|---|
| Inject `cache_control` markers | Not possible — request building is internal to Claude Code |
| Freeze the system prompt | Not accessible |
| Detect tool definition changes | No event is exposed; can only infer from cache behavior |
| Access API request bytes for diff | Not exposed |
| Use cache diagnostics API (`cache-diagnosis-2026-04-07`) | This is a Anthropic API beta feature for API consumers — not applicable to Mods |

---

## 4. Optimization Strategies — Evaluation

### Strategy A — Cache Loss Detection

**Objective**: Detect when cache read ratio degrades unexpectedly.

**Available data**: `cache_read_input_tokens`, `cache_creation_input_tokens`, `input_tokens` per turn. Model per turn (to detect model switches). `session.compact` events.

**Feasibility**: **Confirmed (partial)**.

The `cacheEfficiencyRule` already detects sustained low cache ratios. The gap is **correlation**: we cannot currently distinguish:

- Normal warmup (session start, post-compaction)
- Model switch invalidation
- Instruction file change
- Unexpected mid-session degradation

**What can be added**:

1. **Track model per turn** — if `event.usage.model` changes between turns, flag it as a probable cache invalidation event
2. **Track post-compaction turns** — the `compactTrigger` field in `HistoryEntry` already records this; the rule can be refined to suppress low-ratio alerts for N turns after compaction
3. **Correlate instruction file changes** — the `prompt.context` hook fires at session start; storing the hash/list of `instructionFiles` would let us detect when CLAUDE.md content changed between sessions

**Limitation**: Even with better correlation, the Mod can only report what likely caused a cache miss. It cannot repair it autonomously.

**Confidence**: HIGH for observation; LOW for root-cause attribution.

---

### Strategy B — Cache Stability Analysis

**Objective**: Identify factors causing prefix instability.

**Feasibility**: **Partial**.

| Factor | Observable? | Notes |
|---|:---:|---|
| Model change | YES | Via `event.usage.model` turn-over-turn |
| Instruction file change | YES (at session start) | Via `prompt.context` hook's `instructionFiles` |
| Tool definition change | NO | No event exposed |
| System prompt modification | NO | Not accessible |
| Compaction | YES | Via `session.compact` event |
| Session start (cold cache) | YES | Via `session.start` |
| Agent/subagent context | PARTIAL | `agentId` on events; subagent cache behavior is not separately observable |

**Most actionable insight**: Model changes are observable and are the most destructive invalidators (model-scoped caches). If `event.usage.model` changes mid-session, the Mod can warn: "Model changed — cache has been fully invalidated."

**Existing gap**: We store `model` per turn in `NormalizedTurnUsage.model` but don't currently compare consecutive turns to detect switches.

---

### Strategy C — Context Lifecycle Optimization

**Objective**: Improve context preservation during transitions (compaction, session resume, handoffs).

**Feasibility**: **Confirmed (most actionable)**.

**What is available**:

1. **`$.session.compact({ instructions })`** — a Mod can trigger compaction at a user-authorized moment with custom instructions that bias the summarizer toward preserving cache-stable content (e.g., key decisions, active file paths, current task state). This does **not** improve the cache hit rate of the compaction turn itself (which will always miss), but it can accelerate post-compaction cache recovery.

2. **`session.compact` hook** — a Mod can intercept compaction and augment `instructions` to include phrases like "preserve all currently open file paths", "retain the active task plan in full", etc. This is a **read-modify-pass** operation with no risk to the pipeline.

3. **Detecting optimal compaction timing** — there is a subtlety here. Compacting when context fill is at 80% resets the window (good for future turns). Compacting when cache read ratio is already low (suggesting cache instability) may not be optimal, as the cache is already degraded. The best timing is: **high context fill + reasonable cache efficiency** = compact before the cache degrades further due to context pressure.

**Hypothesis H4 (untested)**: Custom compaction instructions that preserve structured task state (plan, key files, current decisions) may result in a post-compaction conversation that is more cache-stable than a free-form summary, because the structured state is more likely to match what future turns reference.

**Risk**: Any automatic invocation of `$.session.compact()` modifies the user's session. Under ADR-003, this requires explicit user consent. The Mod must recommend, not execute.

---

### Strategy D — Direct Cache Optimization

**Objective**: Control `cache_control` markers or other API parameters to improve caching.

**Feasibility**: **NO-GO**.

The Claude Code Mod SDK does not expose:
- The request being built before it is sent
- The system prompt content
- Tool definition serialization
- `cache_control` marker placement

There is no hook that fires between "user sends message" and "API request is sent". The `turn.start` hook fires before the first model call but does not expose or allow modification of the request.

**Conclusion**: This strategy is **not implementable** within the Mod constraint. It would require either a core Claude Code change or an MCP App approach (explicitly excluded by ADR-001).

---

### Strategy E — Workflow-Level Optimization

**Objective**: Guide user behavior to reduce unnecessary cache invalidation.

**Feasibility**: **Confirmed (advisory, existing + extensible)**.

| Workflow action | Currently supported | Extension needed |
|---|:---:|---|
| Recommend compaction when fill > 85% | YES (`contextFillRule`) | — |
| Recommend compaction when fill growing rapidly | YES (`contextGrowthRule`) | — |
| Warn about low cache efficiency | YES (`cacheEfficiencyRule`) | Improve with post-compaction windowing (already in ES-008) |
| Warn about model change → cache miss | NO | Detect via `event.usage.model` comparison |
| Recommend stabilizing CLAUDE.md | YES (implicit in `cacheEfficiencyRule` explanation) | Make explicit, link to instruction file changes |
| Warn about approaching rate limit | YES (`rateLimitRule`) | — |
| Suggest new session for major task shift | NO | Needs task-shift detection heuristic |

**Most valuable addition**: Model-change detection + explicit advisory linking model changes to cache invalidation. This is high-confidence (we know model changes = full cache miss) and low-effort (one new rule).

---

## 5. Feasibility Matrix

| Strategy | Objective | SDK Capability | Intervention Type | Feasibility | Impact Potential | Risks | Complexity | Validation Method | Affects Real Cache? |
|---|---|---|---|---|---|---|---|---|---|
| A — Cache Loss Detection | Detect degradation early | `event.usage` per turn | Observation | **Confirmed** | Medium | Low | Low | Compare cache ratio trends across sessions | No — observation only |
| A+ — Model-Change Detection | Link model switch to cache miss | `event.usage.model` comparison | Observation + Recommendation | **Confirmed** | Medium | Low | Low | Verify: model switch → cache_read drops to 0 next turn | No — advisory only |
| B — Instruction File Tracking | Detect CLAUDE.md change → cache miss | `prompt.context` hook `instructionFiles` | Observation + Recommendation | **Confirmed** | Medium | Low | Medium | Hash files at session start, compare on next start | No — advisory only |
| C1 — Compaction Timing | Trigger compaction at optimal moment | `$.session.compact()` | Action (requires user consent) | **Conditional** | Medium–High | Medium (must not auto-trigger) | Medium | Measure post-compaction recovery rate | YES — compaction resets + rebuilds cache |
| C2 — Compaction Instruction Injection | Preserve structured state in summary | `session.compact` hook | Passive interception | **Confirmed** | Medium | Low | Low | Compare post-compaction context quality / cache recovery speed | YES — may accelerate post-compaction cache rebuild |
| D — Direct Cache Control | Inject `cache_control` markers | Not available | — | **NO-GO** | — | — | — | — | — |
| E1 — Model-Change Advisory | Warn user when model changes mid-session | `event.usage.model` per turn | Recommendation | **Confirmed** | Low–Medium | None | Low | Rule fires when model changes, disappears next turn | No |
| E2 — CLAUDE.md Stability Advisory | Advise on stable system prompt | `prompt.context` instructionFiles | Recommendation | **Confirmed** | Low–Medium | None | Low | Rule fires when instruction files change | No |

**Priority ranking** (confirmed × impact × low risk):

1. **C2 — Compaction instruction injection** — no risk, confirmed capability, possible cache benefit
2. **A+ — Model-change detection** — confirmed, zero risk, fills observability gap
3. **B — Instruction file tracking** — confirmed, low risk, useful for correlation
4. **C1 — Compaction timing recommendation** — conditional (not automatic), medium complexity

---

## 6. Prototype Assessment

### Is a prototype warranted?

**Yes, for C2 only** — a minimal prototype of `session.compact` hook interception to inject structured compaction instructions.

**Why C2 and not C1**: C1 (triggering compaction) requires user consent flow and UI work. C2 (augmenting instructions on any compaction) is a passive hook with no side effects — it fires only when compaction is already happening.

### Prototype specification

```typescript
// In hooks/register.tsx — DISABLED BY DEFAULT (guarded by a config flag)
//
// Proof of concept only — not part of the production pane render path.
// Can be removed by deleting this handler.
//
// Goal: when compaction fires for any reason, append structured state
// preservation instructions to the existing instructions string.
// This does not trigger additional LLM calls — the summarizer was going
// to run anyway; we are only biasing what it preserves.

on('session.compact', async ($, event, next) => {
  // Only intercept if the prototype flag is explicitly enabled.
  // Default: false — no behavior change to production.
  if (!COMPACTION_INSTRUCTION_PROTOTYPE) return next(event);

  const snap = await read($, paneAtom);
  const preservationHint = [
    event.instructions,
    '— When summarizing: preserve the active task plan, key file paths, current decisions, and any open questions in full. Prioritize stable factual state over ephemeral observations.',
  ].filter(Boolean).join('\n');

  return next({ ...event, instructions: preservationHint });
});
```

**Validation approach**: Compare two sessions of equivalent work (same task type, similar turn count):
- Session A: compaction with default instructions
- Session B: compaction with augmented instructions
- Measure: turns to reach `cache_read_input_tokens > 50%` of total input after compaction

**Decision gate**: If no measurable difference after 5+ compaction events across sessions, abandon C2.

**Decision**: This prototype is small enough (~15 lines gated by a flag) and low-risk enough to be included in ES-010 scope, **not** as a deliverable of ES-009.

**ES-009 verdict**: No prototype code committed. The investigation alone justifies the CONDITIONAL GO recommendation.

---

## 7. Limitations and Risks

### L1 — The core loop is opaque

The most impactful caching levers (stable system prompt, deterministic tool serialization, appropriate `cache_control` placement) belong to Claude Code's internal implementation. The Mod operates after the fact, observing outcomes but not controlling causes.

### L2 — Cache metrics are noisy

`cache_read_input_tokens` and `cache_creation_input_tokens` aggregate across all model calls within a turn, including tool calls. A turn with many tool calls may show high `cache_creation` not because the system prompt changed, but because each tool result creates a new cache entry. Distinguishing "system prompt cache miss" from "per-tool-result write" is not possible from the aggregated per-turn figures.

### L3 — Post-compaction recovery timing is unknown

We do not know how many turns it takes for the cache to fully rebuild after compaction. The `cacheEfficiencyRule` requires 3 turns minimum, but meaningful cache read ratios likely take 5–10 turns. Claiming that augmented compaction instructions "accelerate recovery" requires a controlled experiment.

### L4 — `$.session.compact()` risks

Triggering compaction changes the conversation. If the Mod triggers compaction automatically (without user consent), it may:
- Interrupt Claude mid-task
- Lose context the user considered important
- Create confusion if it fires unexpectedly

**Mitigation**: Under ADR-003, automatic actions are prohibited. Any use of `$.session.compact()` must be advisory only ("consider running /compact now") or explicitly authorized by the user via a UI interaction.

### L5 — Compaction instruction injection quality is unvalidated

The preservation instructions in the C2 prototype are hypotheses. There is no evidence yet that they produce better post-compaction cache recovery. The summarizer model may already preserve what matters. This is the core validation gap.

---

## 8. Recommendation

### Recommendation: **CONDITIONAL GO**

**Condition**: ES-010 must include at minimum:

1. **Model-change detection** (A+) — observe `event.usage.model` turn-over-turn, fire a new advisory recommendation when the model changes mid-session.
2. **Instruction file change tracking** (B) — hash `instructionFiles` from `prompt.context` at session start; detect cross-session CLAUDE.md changes; link to cache efficiency observations.
3. **Post-compaction warmup suppression** (A) — refine `cacheEfficiencyRule` to not fire for N turns after compaction (or correlate with `compactTrigger` field in history).
4. **Compaction instruction injection prototype** (C2) — gated by a config flag; not part of default behavior; designed to be measured and removed if ineffective.

**Reject** unless validated:

- Automatic invocation of `$.session.compact()` without user consent (blocked by ADR-003)
- Any form of system prompt injection (not feasible)
- Workflow suggestions based on task-shift detection (too speculative, no reliable signal)

### Why not NO-GO

The confirmed capabilities (A+, B, C2) are achievable within the existing architecture, low-risk, and address real observability gaps. The current advisory rules are correct but lack the nuance to distinguish "normal low ratio" from "anomalous degradation tied to a specific event."

### Why not unconditional GO

Strategy D (direct cache control) is impossible. Strategies A and E need significant calibration before claiming they produce real cache improvements. Strategy C1 (programmatic compaction) is too risky to ship without a measured validation protocol. The 30% cache efficiency threshold is an initial hypothesis (ES-006 comment in `rules.ts`) that has not been validated against real session data.

---

## 9. ES-010 Proposal

**Recommended scope**: "Cache Event Correlation and Compaction Intelligence"

### Objective

Extend the Context Advisor with:

1. **Cache event correlation** — link observed cache metric changes to specific events (model switch, instruction file change, compaction, session start).
2. **Refined advisory rules** — improve `cacheEfficiencyRule` with post-compaction windowing and model-change detection.
3. **Compaction instruction injection** — passive prototype, gated by flag, to be measured against baseline.
4. **Validation protocol** — define a reproducible measurement approach for cache metrics across equivalent session pairs.

### What it is NOT

- A Cache Intelligence Engine with autonomous decisions
- A system that triggers actions without user consent
- An architecture that requires backend infrastructure

### Version

Suggested: **v0.9.0**

### Dependencies

- ES-009 (this investigation) — complete
- ES-008 (v0.8.0 stabilization) — merged to main

### Alternative: narrow scope

If the team prefers a minimal increment, ES-010 could target only A+ (model-change detection) and B (instruction file tracking) — 2 new rules, low complexity, confirmed value. Skip C2 until there is user demand for compaction intelligence.

---

## 10. Appendix — SDK Types Used

Verified in `claude-code.d.ts` (engine 2.1.325):

```typescript
// ModelUsage — available on TurnCompleteInput.usage (TurnUsage extends ModelUsage)
type ModelUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

// TurnUsage — event.usage on turn.complete
type TurnUsage = ModelUsage & { model: string };

// SessionCompactArgs — argument of $.session.compact()
type SessionCompactArgs = {
  instructions?: string;  // guidance for the summarizer
};

// SessionCompactInput — event on 'session.compact' hook
type SessionCompactInput = {
  trigger: SessionCompactTrigger;  // 'manual' | 'auto' | 'precompute' | 'plugin'
  agentId?: string;
  instructions?: string;
  messages: readonly SessionMessage[];  // full transcript
};

// PromptContextInput — event on 'prompt.context' hook
type PromptContextInput = {
  blocks: readonly PromptContextBlock[];
  instructionFiles?: readonly InstructionFile[];  // CLAUDE.md files loaded
};

// SessionCompacted — result of next(event) on 'session.compact'
type SessionCompacted = {
  messages: readonly SessionMessage[];
  tokensBefore?: number;
  tokensAfter?: number;
  usage?: ModelUsage;  // summarizer's token cost
  skip?: undefined;
};
```

**Not available** (confirmed absent or null in production):
```typescript
// $.session.usage({ breakdown: 'summary' }).context.breakdown.apiUsage
// → Returns null in Desktop Code tab (ES-001 §3.1)
```
