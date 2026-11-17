# ES-005 — Runtime Validation Report

- Status: **In Progress — awaiting runtime execution**
- Date: 2026-11-17
- Environment: Claude Desktop (Code tab), Mod v0.5.0

---

## Validation Matrix

| Scenario | Method | Result | Proof | Limits |
|---|---|---|---|---|
| A — New session | Manual runbook (see §2) | ⬜ Not run | — | Requires live Claude Desktop |
| B — `/clear` | Manual runbook (see §3) | ⬜ Not run | — | Requires live Claude Desktop |
| C — Resume | Manual runbook (see §4) | ⬜ Not run | — | Requires live Claude Desktop |
| D — Compaction | Manual runbook (see §5) | ⬜ Not run | — | Requires live Claude Desktop; compaction must be triggered |
| E — Sub-agents | Manual runbook (see §6) | ⬜ Not run | — | Requires live Claude Desktop; task must spawn a subagent |
| Performance | Manual measurement (see §7) | ⬜ Not measured | — | Requires live Claude Desktop; timing appears in Overhead section of pane |
| Error containment | Code review + structural analysis | ✓ Verified | All hooks have try/catch; `next(event)` outside try block | Only proven structurally; runtime failure injection not possible without SDK mock |
| Timing module | Automated tests (`timing.test.ts`) | ✓ Covered | 10 unit tests | Tests pure logic only; SDK integration untested |
| Rules — edge cases | Automated tests (`rules.test.ts`) | ✓ Covered | 50+ unit tests total | Pure functions; hook wiring not tested |
| History — edge cases | Automated tests (`history.test.ts`) | ✓ Covered | 10 unit tests | Pure functions |
| Normalize | Automated tests (`normalize.test.ts`) | ✓ Covered | 10 unit tests | Pure functions |

---

## §1 — Prerequisites (all scenarios)

1. Claude Desktop installed with the Context Optimizer Mod enabled.
2. The Mod is loaded: open the Code tab and confirm "Context Optimizer" pane is visible.
3. No other Mods should interfere with session lifecycle events.
4. Note the current session ID (first 12 chars shown in the pane's Session section).

---

## §2 — Scenario A: New session

**Purpose**: verify that `session.start` correctly initializes all atoms and opens the pane.

**Prerequisites**: none beyond §1.

**Actions**:
1. Open Claude Desktop Code tab with the Mod installed.
2. Wait for the initial turn (or trigger one with a simple prompt like "ping").

**Expected results**:
- Pane shows "Context Optimizer" header.
- Session section shows a non-null session ID (12-char prefix).
- `turns: 0` before the first turn fires, `turns: 1` after.
- `measurements: 0` (unless `session.measure` fired — that's also valid).
- Status line shows `ctx:ok` (or `ctx:XX%` if a turn fired).
- History section: `1/100 entries` (the `session_start` entry).
- No recommendations ("All good — no active recommendations").

**Failure conditions**:
- Pane does not open.
- Session ID is null or unchanged from a previous session.
- Counts are non-zero on a fresh session.
- An error message appears in the status line.

**Observations to record**: actual session ID prefix, actual turn/measurement counts, pane open time.

---

## §3 — Scenario B: `/clear`

**Purpose**: verify that `session.end(reason='clear')` resets all atoms and reopens the pane.

**Prerequisites**: at least 3 turns completed in the current session (verify `turns: ≥ 3` in pane).

**Actions**:
1. Note the current session ID prefix.
2. Run `/clear` in the Code tab.

**Expected results**:
- Pane closes briefly, then reopens automatically.
- New session ID (different from the noted one).
- `turns: 0`, `measurements: 0`, `compactionCount: 0`.
- Context section: N/A (no measurement yet in new session).
- History: `1/100 entries` (only the `session_start` entry for the new session).
- Status line: `ctx:ok`.
- No recommendations.

**Failure conditions**:
- Session ID unchanged after `/clear`.
- `turns` counter retains its pre-clear value.
- Pane does not reopen.
- Pane shows recommendations based on pre-clear history.

**Observations to record**: old session ID prefix, new session ID prefix, `turns` value after clear.

---

## §4 — Scenario C: Session resume

**Purpose**: understand `session.end(reason='resume')` behavior.

**Note**: This scenario is the least well-understood. The SDK documentation states that `session.start` does not fire after a resume — the `session.end` handler with `reason='resume'` is the signal. The Mod resets all atoms on resume to avoid presenting stale context data. This may discard valid context if the user resumes mid-session. The current decision (reset on resume) is documented in ES-004 §Post-review fix.

**Prerequisites**: an active session with ≥ 3 turns.

**How to trigger**: close and reopen the Claude Desktop Code tab (or restart Claude Desktop without ending the session cleanly).

**Expected results**:
- Pane shows updated content after resume.
- Session ID reflects the resumed session.
- Atoms reset (turns: 0 — fresh start from resume point).
- Status line: `ctx:ok`.
- History: 1 entry (session_start for the resumed session).

**Alternative**: if resume fires `session.start` instead of `session.end(resume)`, then the `session.start` handler resets the atoms and the `session.end` handler is not reached. Both behaviors are safe.

**Observations to record**: confirm whether `session.end` or `session.start` fires on resume; session ID before and after; counter values.

**Open question**: does `$.session.id()` after `next(event)` in `session.end(resume)` return the new session ID or the same ID? This cannot be verified without a live session.

---

## §5 — Scenario D: Compaction

**Purpose**: verify that `session.compact` is received, history is updated correctly, and rules do not fire spuriously post-compaction.

**Prerequisites**: an active session with ≥ 5 turns and ≥ 70% context fill (to trigger `contextFillRule`).

**How to trigger**: run `/compact` in the Code tab (or let automatic compaction occur if context is very high).

**Expected results**:
- Pane's Session section shows `compactions: 1 (last: manual)` (or `auto` if triggered automatically).
- Status line shows `ctx:compacted(manual)` (or `ctx:compacted(auto)`).
- Context section: N/A (tokens/percent absent until next response).
- Rules section: "All good" — no contextFillRule based on pre-compaction fill.
- After the first post-compaction turn: context fill restarts from a low value; growth rule requires 3 new turns before it can fire.
- History: a `compact` entry is present; entries after it reflect only the new context window.

**Failure conditions**:
- `compactionCount` not incremented after `/compact`.
- `contextFillRule` still fires immediately after compaction (would indicate ES-004 fix regressed).
- Status line does not update.

**Observations to record**: `compactionCount` value, `lastCompactTrigger` value, context fill value before and after, recommendations before and after.

---

## §6 — Scenario E: Sub-agents

**Purpose**: verify that subagent turns are recorded with `isSubagent=true` and do not cause double-counting in growth/cache rules.

**Prerequisites**: a task that spawns a subagent (e.g., use an agentic tool).

**How to trigger**: run a prompt that uses a tool known to spawn a Claude subagent (e.g., the `Agent` MCP tool or a task that invokes a subagent in background).

**Expected results**:
- After the subagent turn fires:
  - `turns` counter in pane increments (the subagent turn is still counted in the display — this is intentional; the counter reflects all turn.complete events).
  - In history, the subagent entry has `isSubagent: true`.
  - `contextGrowthRule` and `cacheEfficiencyRule` do not count this turn toward their thresholds.
- Main-session turns and subagent turns are distinguishable by the presence/absence of `agentId` in the history entry.

**Failure conditions**:
- Subagent turn counted as main-session turn in growth/cache analysis.
- Pane shows incorrect context fill (subagent usage mixed with main session).
- Double-counting: same context data recorded twice.

**Note on context reading**: as documented in ES-004, `$.session.usage()` from a subagent's `turn.complete` hook returns the **main session's** context. This means the subagent turn records the same context values as the main session would — which is expected and intentional.

**Observations to record**: whether `agentId` is non-null in the pane history (not directly shown), turn count changes, context fill values.

---

## §7 — Performance Measurement Protocol

### Setup

The pane's "Overhead (p50 / p95 ms)" section appears automatically after at least 1 turn fires, once performance data is available. Data is in-memory only and resets on Mod reload.

### Measurement steps

1. Load the Mod in a fresh Claude Desktop session.
2. Run 10+ turns on a standard medium-complexity task.
3. Open the pane and read the Overhead section.
4. Record p50 and p95 for `turn.complete`, `session.measure`, `ui.render`.

### Acceptable thresholds

These are design targets, **not measured results**. They were defined in ES-004 §Performance Protocol.

| Handler | p50 target | p95 target | Rationale |
|---|---|---|---|
| `turn.complete` | < 10 ms | < 20 ms | Turn latency budget; <5 ms is ideal |
| `session.measure` | < 5 ms | < 10 ms | Lighter than turn.complete |
| `session.compact` | < 5 ms | < 10 ms | Rare event |
| `ui.render` | < 20 ms | < 50 ms | Pane re-renders on atom change |
| `session.start` | < 10 ms | < 20 ms | Once per session |

A handler exceeding its p95 target consistently (across 10+ turns) should be investigated before shipping.

### Methodology note

Handler timing (`Date.now()` before/after try/catch) includes atom reads/writes but **not** `next(event)` time (for handlers where `next` is called after the try/catch). It does **not** measure end-to-end turn latency.

To measure end-to-end impact, compare turn response time with and without the Mod, across 5+ comparable tasks.

### Results (to be filled by human operator)

| Handler | Samples | p50 (ms) | p95 (ms) | Max (ms) | Meets target? |
|---|---|---|---|---|---|
| `turn.complete` | — | — | — | — | ⬜ |
| `session.measure` | — | — | — | — | ⬜ |
| `session.compact` | — | — | — | — | ⬜ |
| `ui.render` | — | — | — | — | ⬜ |
| `session.start` | — | — | — | — | ⬜ |

---

## §8 — Anomalies and Fixes Applied in ES-005

### Fix 1 — Error containment in all hooks

**Problem**: no try/catch around handler bodies. An exception in `$.session.usage()`, `$.clock.now()`, atom read/write, or `makeEntry()` would propagate uncaught and prevent `next(event)` from being called — stalling the event pipeline.

**Fix**: each handler now wraps its body in `try/catch`. `next(event)` is always called outside the try block (or `result` is returned after `next(event)` for compact/end). On error, the status line shows `ctx:err`.

**Evidence**: structural code review. Runtime verification: if `ctx:err` appears in the status line after a turn, the error path was exercised.

### Fix 2 — `turn.complete`: eliminate post-update pane read

**Problem**: after `update($, paneAtom, ...)`, the handler immediately called `read($, paneAtom)` to get `sessionId`. This was an extra async round-trip where a pre-update read would suffice.

**Fix**: pane is read **before** the update to capture `sessionId`. The post-update read is removed.

**Impact**: removes one async atom read per turn. Measured overhead reduction: not quantified (expected < 1 ms on local hardware).

### Fix 3 — Pane render: graceful fallback on exception

**Problem**: a render exception in `ui.render` would propagate uncaught and leave the pane blank or in an error state.

**Fix**: the render body is wrapped in try/catch. On failure, a minimal `<Box><Text>Context Optimizer — render error</Text></Box>` is returned.

---

## §9 — Remaining Open Items

1. **All manual scenarios (A–E)** must be executed in a live Claude Desktop session before this story is marked Done.
2. **Performance numbers** must be filled in §7 by a human operator.
3. **Session resume `$.session.id()` behavior** post-`next(event)` is unverified.
4. **Sub-agent panel display** when multiple agents are active simultaneously is unverified.
5. **Threshold empirical validation** (ES-004 §Remaining Open Items) is deferred.
