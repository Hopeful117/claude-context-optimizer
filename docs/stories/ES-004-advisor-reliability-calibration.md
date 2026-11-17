# ES-004 — Advisor Reliability & Calibration

- Status: **Implemented**
- Date: 2026-11-17
- Branch: `feat/es-002-observability-foundations`
- Version: `0.4.0`

## Problem

Three reliability defects were identified in the recommendation engine built in ES-003:

### Defect 1 — contextFillRule: post-compaction false positive

`contextFillRule` scanned the full history backward and returned the first entry with a non-null `contextPercent`. After compaction, the rule would find a pre-compaction measurement (e.g. 90%) and continue recommending compaction on a context that had just been reset.

### Defect 2 — contextGrowthRule: measure events counted as turns

`contextGrowthRule` included entries with `kind === 'measure'` alongside `kind === 'turn'` entries. Because `session.measure` can fire multiple times within a single turn (or between turns), the rule could reach its `CONTEXT_GROWTH_MIN_TURNS` threshold using fewer actual turns than reported, and the explanation "over the last N turns" was then incorrect.

### Defect 3 — cacheEfficiencyRule: compaction boundary not respected

`cacheEfficiencyRule` used `latestEntries()` without regard for compaction boundaries. Immediately after compaction, turns with zero cache reads (expected during cache warmup) would satisfy the minimum turn threshold and trigger a "low cache efficiency" observation, even though the low ratio was completely normal.

Additionally, the confidence level (`medium`) was too high for a metric the user has limited direct control over.

## Decisions

### 1. Use `entriesSinceLastCompact()` as the data boundary for all fill-related rules

After compaction, the context window is reset. Any metric that depends on the current fill or the current-window growth rate must only look at entries after the last compaction event. This applies to `contextFillRule`, `contextGrowthRule`, and `cacheEfficiencyRule`.

**Consequence**: these rules return `null` when no data is available in the current window — which is correct. They resume as new measurements arrive.

### 2. contextGrowthRule filters to `kind === 'turn'` only, excluding subagents

`session.measure` events are not turns. They must not be counted as growth data points. The explanation now reads "main-session turns" to be accurate.

Subagent turns (`isSubagent === true`) are also excluded. The `$.session.usage()` call from a subagent's `turn.complete` hook returns the main session's context, making those readings duplicates of the main session. Including them would artificially inflate the apparent turn count without reflecting the user's actual work.

### 3. Revised compaction recommendations — no prescriptive `/compact` language

High context fill does not automatically mean compaction is needed. The thresholds (70% and 85%) are occupation indicators, not compaction triggers. Revised explanations:
- 85%+: "the window is filling up. If the task continues much longer, a manual /compact or a fresh session **may be worth considering**."
- 70%+: "the window is over 70% full. Worth keeping in mind if the task has a long way to go."

No `/compact` command is recommended automatically.

### 4. cacheEfficiencyRule: confidence lowered to 'low', category to 'observation'

A low cache read ratio is normal in many legitimate scenarios: session start, post-compaction warmup, large task switch, multi-agent activity. The user has limited direct control over prompt cache efficiency. The rule is kept as an observation (not disabled) but confidence is `'low'` and the explanation acknowledges normal causes.

The rule still requires `CACHE_EFFICIENCY_MIN_TURNS` turns in the **current context window** (after last compaction) before firing.

### 5. Add `category` to the Recommendation model

A new `Category` type (`'observation' | 'warning' | 'action'`) is added to `Recommendation`. This allows callers to distinguish informational readings from items that may require a decision.

Mapping:
| Rule | Category |
|---|---|
| `context-fill-high` | `warning` |
| `context-fill-medium` | `observation` |
| `cache-efficiency-low` | `observation` |
| `rate-limit-high` | `warning` |
| `rate-limit-medium` | `observation` |
| `context-growth-rapid` | `warning` |

`confidence` = data/reasoning quality. `category` = what the user is expected to do. They are orthogonal.

The pane now renders a prefix icon: `⚠` for warnings, `ℹ` for observations, `→` for actions.

## Acceptance Criteria

| # | Criterion | Result |
|---|---|---|
| 1 | High pre-compaction context → null after compaction | ✓ rule returns null |
| 2 | New low measurement after compaction → respected | ✓ |
| 3 | Multiple `session.measure` during one turn → not counted as multiple turns | ✓ only `kind='turn'` entries used |
| 4 | Regular growth across 3 distinct turns → fires | ✓ |
| 5 | Subagent turns excluded from growth analysis | ✓ `isSubagent` filter applied |
| 6 | Few cache reads but only 2 turns post-compaction → no observation | ✓ `< CACHE_EFFICIENCY_MIN_TURNS` |
| 7 | High cache read ratio → no observation | ✓ |
| 8 | No rate limits → null | ✓ |
| 9 | Missing/partial data → graceful null | ✓ all rules null-safe |
| 10 | History at 100-entry capacity → no crash | ✓ |
| 11 | New session → independent history | ✓ |
| 12 | Insufficient evidence → no recommendations | ✓ |

## Tests

New regression tests added to `src/advisor/rules.test.ts`:

- `contextFillRule: null after compaction even with high pre-compaction context`
- `contextFillRule: uses new post-compaction measurement`
- `contextFillRule: fires on new high fill after compaction`
- `cacheEfficiencyRule: null immediately after compaction`
- `cacheEfficiencyRule: null with only 2 turns after compaction`
- `cacheEfficiencyRule: subagent turns excluded from count`
- `contextGrowthRule: measure events do not count as turns`
- `contextGrowthRule: multiple measure events during same turn do not form 3 turns`
- `contextGrowthRule: subagent turns do not count`
- `contextGrowthRule: null when fewer than min turns after last compaction`
- `all rules: return null gracefully on empty history`
- `all rules: handle history at max capacity (100 entries) without crashing`
- And others (see `rules.test.ts`)

## Performance Protocol

The overhead measurement protocol is documented here but measurements cannot be executed in this environment (no Claude Desktop session available, no `claude` CLI logged in).

### Protocol (reproducible)

**Setup**: A real Claude Desktop session with the Mod installed. Record baseline turn latency (without Mod) on a standard task (5 turns, medium-size context). Then re-run with the Mod.

**Measurements to take**:
1. **Hook dispatch**: time from `turn.complete` event receipt to `next(event)` call. Use `$.clock.now()` before and after the hook body.
2. **Normalization**: `makeEntry()` call time (pure function, no I/O).
3. **History append**: `appendEntry()` call time — includes one array copy.
4. **Rule evaluation**: `evaluate()` call time in `ui.render` handler.
5. **Pane render**: time from render start to frame draw.

**Method**: Log timestamps via `$.ui.status()` or a dedicated log entry in history. Run 10+ turns. Report p50/p95.

**Expected ranges** (theoretical, unverified):
- Pure functions (`makeEntry`, `evaluate`): < 1 ms
- `appendEntry`: < 1 ms (single array slice)
- Full hook overhead: < 5 ms per turn

**Note**: No benchmark result is claimed without measurement. The overhead remains an open item from ES-001.

## Post-review fix — `/clear` does not restart the mod

### Finding

After ES-004 implementation review, an additional bug was identified: **the mod does not reset after `/clear`**.

Root cause confirmed by the official type declarations (`claude-code.d.ts`, `SessionEndInput`):

> `clear` is how a hook sees a `/clear`: the conversation ends, the process goes on under a new session id, and **no `session.start` fires** for it.

`ExitReason = 'clear' | 'resume' | 'logout' | 'prompt_input_exit' | 'other'`

After `/clear`, the process continues with a fresh session ID but `session.start` never fires for the new session. The mod's atoms (turn counter, history, session ID) remained at the pre-clear values. The pane was also automatically closed by `/clear` and not reopened.

### Fix

Added a `session.end` handler in `hooks/register.tsx` that:
1. Calls `next(event)` first (required: the engine processes the end step, switching the session ID)
2. If `reason === 'clear'` or `reason === 'resume'`: resets `paneAtom` and `historyAtom` using the new session ID (available from `$.session.id()` after `next(event)`)
3. Calls `$.ui.open()` to reopen the pane
4. Resets the status line

This mirrors the `session.start` handler's initialization logic.

The same fix covers `'resume'` for symmetry: when a session is resumed, the mod reloads into a potentially different context than what it last saw.

### Note on testing

The `session.end` handler cannot be exercised by the existing pure-function test suite (which tests rules and history functions in isolation). This behavior requires a live Claude Desktop session. Manual test protocol:

1. Load mod in Claude Desktop Code tab
2. Have at least 3 turns (verify turn count > 0 in pane)
3. Run `/clear`
4. Verify: pane reopens, turn count = 0, session ID changed, history empty

## Remaining Open Items

1. **Performance measurement**: requires a live Claude Desktop session with instrumentation. Deferred to a later story or manual test.
2. **Empirical threshold validation**: the thresholds (70%, 85%, 30%, 15%) are hypotheses. Validation requires comparing session outcomes with and without recommendations across comparable tasks (Phase 2).
3. **`cacheEfficiencyRule` long-term relevance**: if users cannot improve cache efficiency directly, this rule may be better converted to a purely diagnostic display metric. Revisit after Phase 2 baseline data.
4. **`contextGrowthRule` direction**: a negative delta (shrinking context post-compaction) is currently not flagged. This could be useful context for the user.

## Proposed Next Step — ES-005

**Context Advisor V1 — User feedback and threshold calibration**

Collect real usage data from at least 5 representative sessions. For each recommendation that fired, record:
- Was the action taken?
- Did it improve the session?
- Was it a false positive?

Use this to validate or adjust the threshold constants. Only then mark thresholds as empirically informed rather than hypothetical.

Prerequisite: Phase 2 baseline task defined (see roadmap).
