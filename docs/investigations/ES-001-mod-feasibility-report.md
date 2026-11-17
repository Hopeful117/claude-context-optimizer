# ES-001 — Claude Code Mods feasibility report

- Date: 2026-11-17
- Status: **Live runtime validation complete — cache breakdown confirmed via event.usage**
- Engine build: 2.1.325 (from installed type declarations path)
- Source of truth: `/tmp/claude-1000/bundled-skills/2.1.325/.../plugin-authoring/types/claude-code.d.ts`

---

## 1. Test environment

| Item | Value |
|---|---|
| Engine version | 2.1.325 (from bundled skill path; confirmed by `$.session.version()` in live mod) |
| Host | Claude Desktop — Code tab |
| Mod installed path | `~/.claude/dev-mods/<session-id>/context-optimizer/` |
| Hot-reload | Active (confirmed: mod loads, status line visible) |
| Prototype file | `hooks/register.tsx` |
| `claude plugin validate` | `√ Validation passed with warnings` (warnings: author, icon — no blockers) |

---

## 2. Mod loading — VALIDATED

- Mod loaded via hot-reload in Claude Desktop Code tab.
- `session.start` hook fires on load; `$.session.id()`, `$.session.version()`, `$.session.model()` called without error.
- Status line (`$.ui.status()`) visible and updating.
- `turn.complete` and `session.measure` hooks fire in live session.
- Pane (`$.ui.open()` + `ui.render{component=Pane}`) renders correctly in Claude Desktop Code tab.
- `atom`/`read`/`update` reactive state works; pane updates after each turn.

---

## 3. Metrics availability matrix

### 3.1 Context window

| Metric | API field | Status | Notes |
|---|---|---|---|
| Context window size (tokens) | `context.window` | **AVAILABLE** | Always present in `SessionContextUsage`; the model's declared window size |
| Tokens used (total input) | `context.tokens` | **AVAILABLE** | Optional — absent before first API response of the live window; includes uncached + cache_write + cache_read combined |
| Usage percentage | `context.percent` | **AVAILABLE** | Optional — absent before first API response; integer 0–100 |
| Uncached input tokens (isolated) | `event.usage.input_tokens` on `turn.complete` | **AVAILABLE — CONFIRMED LIVE** | Direct from API response via `TurnCompleteInput.usage`; no extra call needed |
| Output tokens | `event.usage.output_tokens` on `turn.complete` | **AVAILABLE — CONFIRMED LIVE** | Same source |
| Cache read tokens | `event.usage.cache_read_input_tokens` on `turn.complete` | **AVAILABLE — CONFIRMED LIVE** | Same source; confirmed non-null in live session |
| Cache write tokens | `event.usage.cache_creation_input_tokens` on `turn.complete` | **AVAILABLE — CONFIRMED LIVE** | Same source |
| Model of the turn | `event.usage.model` on `turn.complete` | **AVAILABLE** | `TurnUsage` extends `ModelUsage` with `model: string` |
| `breakdown.apiUsage` via `$.session.usage({ breakdown })` | `context.breakdown.apiUsage` | **UNAVAILABLE in practice** | Returns null in Desktop Code tab; requires "bound session" per types — condition not met in tested environment |
| Breakdown categories (by type) | `breakdown.categories` | **UNVERIFIED** | Needs `breakdown` call; session binding condition unclear |
| Auto-compact threshold | `breakdown.autoCompactThreshold` | **UNVERIFIED** | Typed; not tested |

**Key finding:** The correct source for per-turn cache and token breakdown is `event.usage` on `turn.complete` — a `TurnUsage` (= `ModelUsage & { model }`) carried directly on the event. `$.session.usage({ breakdown: 'summary' }).context.breakdown.apiUsage` returns null in the Desktop Code tab. Do not use `breakdown` for cache metrics in hooks.

### 3.2 Rate limits

| Metric | API field | Status | Notes |
|---|---|---|---|
| Rate limit windows | `rateLimits[]` | **AVAILABLE** | Present in both `$.session.usage()` and `session.measure` event; empty off subscription or before first reading |
| Window kind | `rateLimits[n].kind` | **AVAILABLE** | `five_hour`, `seven_day`, or `spend_limit` |
| Percent used | `rateLimits[n].percentUsed` | **AVAILABLE** | 0–100, one decimal; can exceed 100 on exceeded spend limit |
| Reset timestamp | `rateLimits[n].resetsAt` | **AVAILABLE** | Optional ISO 8601 string |
| Exact token quota per window | — | **UNAVAILABLE** | No total tokens per window exposed; only `percentUsed` |
| Subscription plan details | — | **UNAVAILABLE** | Not in public types; not derivable from token counts |

### 3.3 Session cost

| Metric | API field | Status | Notes |
|---|---|---|---|
| Session cost (USD) | `cost.usd` | **AVAILABLE (conditional)** | Present only where the host keeps a cost ledger; CLI always has one; Desktop: unverified — field typed as optional |
| Per-request cost breakdown | — | **UNAVAILABLE** | Only session total via `cost.usd` |

### 3.4 Session identity & metadata

| Metric | API field | Status | Notes |
|---|---|---|---|
| Session ID | `$.session.id()` | **AVAILABLE** | Opaque string; suitable as local identifier |
| Engine version | `$.session.version()` | **AVAILABLE** | `{ version, base?, builtAt? }` |
| Model in use | `$.session.model()` | **AVAILABLE** | Returns `string` |
| Session start timestamp | `$.session.usage().startedAt` | **AVAILABLE** | Milliseconds; resets on `/clear` |
| Current working directory | `$.session.cwd()` | **AVAILABLE** | Absolute path |
| Render surfaces | `$.session.surfaces()` | **AVAILABLE** | Array of `RenderSurface` |

### 3.5 Event triggers

| Event | Status | Trigger conditions (from types) |
|---|---|---|
| `session.start` | **AVAILABLE** | Session opens; also fires on reload of module |
| `session.measure` | **AVAILABLE** | Fires when `context`, `rateLimits`, or `cost` changes by a threshold: context fill moves, a rate-limit window moves a whole point or appears/disappears, cost total grows |
| `turn.complete` | **AVAILABLE** | End of each user turn |
| `turn.start` | **AVAILABLE** (typed, not hooked in spike) | Start of each user turn |
| `turn.step` | **AVAILABLE** (typed, not hooked) | Intermediate steps within a turn |
| `session.compact` | **AVAILABLE** | Manual `/compact`, auto threshold, plugin-triggered, or `precompute` |
| `session.end` | **AVAILABLE** (typed, not hooked) | Session closes |

**Key observation on `session.measure` frequency:** The event fires on threshold changes, not on every token. The `changed` field lists which units moved. This means the event is not guaranteed to fire after every turn — only when usage crosses a measurement threshold.

### 3.6 Local persistence (`$.store`)

| Capability | Status | Notes |
|---|---|---|
| `$.store.get/set/delete/keys` | **AVAILABLE** | Persistent across sessions; suitable for cross-turn comparison baseline |
| Scope | Per-plugin, shared across sessions on same host | Appropriate for metadata snapshots |

---

## 4. Live observations (this session)

The following was directly observed with the spike mod loaded in this session:

- **`session.start` fired** and returned valid `id`, `version`, `model` values.
- **`$.ui.status()` renders correctly** on Claude Desktop Code tab (confirmed by user).
- **`turn.complete` fires** after each turn; `$.session.usage()` callable from hook.
- **`session.measure` fires** in live session; `measurements` counter increments.
- **`$.store.set()` callable** without error from hooks.
- **`context.window` always present** in `$.session.usage()` response.
- **`context.tokens` and `context.percent`**: present after the first API response (observed as non-null in active session).
- **`event.usage` on `turn.complete`**: confirmed AVAILABLE — `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` all display real non-null values in the pane.
- **`breakdown.apiUsage`**: confirmed NULL in Desktop Code tab — `$.session.usage({ breakdown: 'summary' }).context.breakdown.apiUsage` returns null; not a usable source for cache metrics in this environment.
- **Pane**: `$.ui.open()` + `ui.render{Pane}` confirmed functional on Desktop; `atom`/`read`/`update` reactive state works correctly.
- **`cost`**: presence on Desktop not fully verified (field optional by type; CLI confirmed in types).
- **`rateLimits`**: array present; content depends on account type.

Fields that could not be fully verified live without instrumenting a compaction:
- `session.compact` event payload structure (typed, hook implemented, not triggered in spike).

---

## 5. What is NOT accessible

- **Per-request token breakdown** (input / output / cache_read / cache_write) without `breakdown` call.
- **Subscription quota details** (token limits per window, plan type) — not in types.
- **Prompt, tool, or code content** — deliberately excluded; not needed for V1.
- **Other sessions' data** — `$.session.id()` scoped to the current session.
- **Subagent-level isolation** — `turn.complete` fires inside subagent loops; `agentId` available on some events.

---

## 6. Privacy and security review

- The spike mod collects only: session ID, engine version, model name, context token counts, rate-limit percentages, cost USD total, timestamps, turn/measurement counters.
- No prompt body, tool output, code, file content, or credentials are collected or stored.
- `$.store.set()` persists metadata locally only. No network calls.
- The mod passes unchanged events to `next()` — no prompt or tool interception.
- `claude plugin validate` confirms: hooks observed are `session.start`, `session.measure`, `turn.complete`, `session.compact`; calls are `$.clock.now`, `$.session.id/model/usage/version`, `$.store.set`, `$.ui.status`.

---

## 7. Performance notes

- `$.session.usage()` without `breakdown`: cheap — reads cached engine state, no API call.
- `$.session.usage({ breakdown: 'summary' })`: local estimate, no API call, acceptable for hooks.
- `$.session.usage({ breakdown: 'full' })`: sends token-count API requests — **not suitable for per-turn hooks**.
- Overhead of metadata `$.store.set()`: one local write per turn/measure event — negligible.
- No timing benchmarks conducted (no repeatable baseline scenario available in spike).

---

## 8. Manual test protocol

For interactions that require human action to verify:

**T1 — session.compact trigger:**
1. Run `/compact` manually in a session with the mod loaded.
2. Verify: status line shows `ctx-optimizer: compaction (manual) observed`.
3. Verify: `$.store` key `ctx.lastCompact` is set.

**T2 — cost field on Desktop:**
1. After at least one turn, check if status line shows `$X.XXXX` or `cost=N/A`.
2. If `cost=N/A`, the Desktop host does not expose the cost ledger via `$.session.usage()`.

**T3 — rateLimits on subscription account:**
1. Check status line for `five_hour:X%` or `seven_day:X%`.
2. If `rl=N/A`, the account has no rate-limit windows reported.

**T4 — cache breakdown (optional, for future spike):**
1. Modify hook to call `$.session.usage({ breakdown: 'summary' })` once per turn.
2. Log `breakdown.apiUsage.cache_read_input_tokens` and `cache_creation_input_tokens`.
3. Verify non-null values appear after cache-intensive turns.

---

## 9. Limitations and open questions

| Item | Status |
|---|---|
| `cost.usd` availability on Desktop | Unverified — optional field, confirmed on CLI |
| `session.measure` exact threshold | Undocumented — observed to fire, but threshold increment not measured |
| `breakdown.apiUsage` via `$.session.usage({ breakdown })` | **Confirmed null** in Desktop Code tab — do not use for cache metrics |
| Subagent session isolation | `agentId` present in some events; not tested in spike |
| Compaction event payload | Typed and hooked; trigger not exercised in spike |
| Overhead measurement | No baseline scenario; timing benchmarks deferred |
| Desktop vs CLI behavioral differences | `cost` and surface rendering differ; `$.ui.status()` confirmed on Desktop |

---

## 10. Go/no-go recommendation

**Go — for Context Advisor V1 using Claude Code Mods.**

The following metrics are reliably available for V1:
- Context window size, fill percentage, and total input tokens — suitable for "you're at X% of context" advisory.
- Rate-limit percentages (account-dependent) — suitable for "approaching rate limit" advisory.
- Session cost total (CLI confirmed, Desktop pending) — suitable for cost tracking.
- Session metadata (ID, model, version, start time) — suitable for session identification and comparison.
- `session.measure` event for reactive updates — suitable for threshold-triggered advisories.
- Local `$.store` persistence — suitable for cross-turn baselines and trend detection.

**Cache breakdown — confirmed live via `event.usage` on `turn.complete`:**
- `event.usage.cache_read_input_tokens` and `cache_creation_input_tokens` confirmed non-null in Desktop Code tab.
- `breakdown.apiUsage` confirmed null in Desktop Code tab — not a usable source; `event.usage` on `turn.complete` is the correct approach.

**Deferred to follow-on spike:**
- Full cache breakdown verification (`breakdown.apiUsage` live values).
- Compaction event payload.
- Overhead benchmarks on a repeatable scenario.
- Cost field behavior on Desktop (manual test T2 above).

**Not in V1 scope (unavailable or policy):**
- Subscription quota (token limits per window) — not exposed.
- Per-request token isolation without breakdown call.
- Automatic compaction or prompt interception (ADR-003).

---

## 11. Obsolete documentation

The following items in the previous version of this report were marked "Pending" and are now resolved:

| Previous item | Updated status |
|---|---|
| "Mod execution — Pending" | Confirmed: TypeScript ES module, hot-reload validated |
| "Claude Desktop Code tab — Pending" | Confirmed: status line visible, hooks fire |
| "Minimum versions — Pending" | Engine 2.1.325 in use; compatible |
| "Native panel — Pending" | `$.ui.status()` validated; full Pane (`$.ui.open`) not tested in spike |
| "Session lifecycle — Pending" | `session.start`, `session.measure`, `turn.complete`, `session.compact` hooked and firing |
| "Context usage — Pending" | `context.tokens`, `context.window`, `context.percent` available; see matrix |
| "Rate limits — Pending" | `rateLimits[]` confirmed in types and live; content account-dependent |
| "Local shared storage — Pending" | `$.store.set()` callable without error |
| "Detailed cache counters — Pending" | Available via `breakdown.apiUsage` with `{ breakdown: 'summary' }` — not live-verified |
| "Subscription quota — Pending" | Confirmed unavailable; not in public types |
