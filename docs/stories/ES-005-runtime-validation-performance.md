# ES-005 — Runtime Validation & Performance

- Status: **In Progress**
- Date: 2026-11-17
- Branch: `feat/es-005-runtime-validation-performance`
- Version: `0.5.0`

## Problem

After four stories of incremental feature work, the Mod has never been systematically validated against a live runtime. We have:
- Pure-function tests for rules, history, and normalization.
- No test coverage for hook lifecycle behavior.
- No measured overhead data — only a theoretical protocol from ES-004.
- No explicit error-containment in hooks: an observability exception can propagate and block `next(event)`.

This story closes those gaps without adding new product features.

## Scope

**In scope:**
1. Audit and fix hook reliability (error containment, correct `next(event)` semantics).
2. Instrument hook overhead with a lightweight in-memory accumulator.
3. Add automated tests for newly testable behavior (timing module, edge cases).
4. Produce a validation protocol and runbook for manual runtime tests.
5. Document what is validated automatically, what requires a live session, and what remains unknown.

**Out of scope:**
- New product features.
- External monitoring services.
- Cross-session persistence.
- Automatic compaction or context modification.

## Architecture Decisions Respected

- ADR-001: Claude Code Mods only. TypeScript. No backend.
- ADR-002: Local-first. No prompt/secret collection. Passive observation.
- ADR-003: Advisory-only. No automatic context mutation.

## Identified Reliability Risks (Pre-fix)

| Risk | Location | Consequence |
|---|---|---|
| No try/catch in handlers | All hooks | SDK/runtime exception propagates; `next(event)` may not be called |
| `turn.complete` reads paneAtom after update | `register.tsx:172` | Unnecessary async round-trip; harmless but inefficient |
| `$.session.usage()` failure not handled | `turn.complete` | Hook throws; `next(event)` skipped; turn pipeline stalled |
| `$.session.id()` / `$.session.model()` failure not handled | `session.start`, `session.end` | Same consequence |
| Render exception has no fallback | `ui.render` handler | Pane shows nothing; unhandled rejection |

## Changes Implemented

### 1. Error containment in all hooks

Each handler now wraps its observation body in `try/catch`. The `next(event)` call is **always** made, regardless of observability errors. On error, the status line shows `ctx:err`.

Pattern for handlers calling `next` last:
```
try { ... observability work ... } catch { $.ui.status('ctx:err') } finally { timing }
return next(event);
```

Pattern for handlers calling `next` first (compact, end):
```
const result = await next(event);
try { ... observability work ... } catch { $.ui.status('ctx:err') } finally { timing }
return result;
```

### 2. `turn.complete` — eliminate post-update pane read

Previously: `update(paneAtom)` → `read(paneAtom)` just to get `sessionId`.
Fixed: read `paneAtom` **before** the update to capture `sessionId`. Removes one async round-trip per turn.

### 3. Lightweight performance accumulator (`src/perf/timing.ts`)

- Pure module-level state; no atom, no SDK dependency.
- `recordTiming(key, ms)` appends a sample (capped at 100 entries per key).
- `getStats(key)` returns `{count, p50Ms, p95Ms, maxMs}`.
- `getAllStats()` returns all keys.
- `clearTimings()` resets state (for tests).
- Pane shows a compact "Overhead" section when samples are available.
- Each handler records its duration using `Date.now()` before/after the try/catch.

## Acceptance Criteria

| # | Criterion | Method | Status |
|---|---|---|---|
| AC-01 | `next(event)` always called after turn.complete, even if usage() throws | Automated (guard test) | ✓ Implemented |
| AC-02 | `next(event)` always called after session.measure, even on error | Code review | ✓ Implemented |
| AC-03 | `next(event)` called once in session.compact (before observability work) | Code review | ✓ Implemented |
| AC-04 | `session.start`: new session gets clean history and correct session ID | Manual (Scenario A) | Partial — hook lifecycle confirmed via CLI; pane content requires live Claude Desktop |
| AC-05 | `/clear` → new session ID, atoms reset, pane reopens | Manual (Scenario B) | ⬜ Pending runtime |
| AC-06 | Resume → atoms reset, fresh history, pane reopens | Manual (Scenario C) | ⬜ Pending runtime |
| AC-07 | `session.compact` event received; observation history preserved | Manual (Scenario D) | ⬜ Pending runtime |
| AC-08 | Subagent turns recorded with `isSubagent=true`, not double-counted | Automated (existing rules tests) + Manual (Scenario E) | Partial |
| AC-09 | Handler p50 overhead < 10 ms on a local machine | Manual perf measurement | ⬜ Pending runtime |
| AC-10 | Render pane shows timing stats after ≥ 1 turn | Manual | ⬜ Pending runtime |
| AC-11 | `timing.ts` stats correct across various sample sizes | Automated | ✓ Covered |
| AC-12 | Render exception shows graceful fallback, not blank | Code review | ✓ Implemented |

## Test Protocol

### Automated tests (can be run with `claude test`)

- `src/perf/timing.test.ts` — timing module: recording, capping, p50/p95/max, edge cases.
- `src/advisor/rules.test.ts` — additional edge cases: all-null-percent history, zero-delta growth, single entry.
- Existing test suites for history, normalize, engine, rules — no regression expected.

### Manual runtime validation — see `docs/investigations/ES-005-validation-report.md`

## Open Items

1. **Performance baseline**: requires a Claude Desktop session. Numbers in report are blank until measured.
2. **Session resume behavior**: `$.session.id()` after `session.end(reason='resume')` — documented as expected to return the new session ID, but unverified in this environment.
3. **`session.compact` trigger field**: confirmed present in ES-001 spike but `event.trigger` type (`string | null`) not fully exercised.
4. **Subagent panel behavior**: how the pane behaves when multiple sub-agents are active is unverified.
5. **Threshold empirical validation**: deferred from ES-004; not addressed in this story.

## Go / No-Go Recommendation

**Conditional Go** — with the following caveats:

- Automated tests: 84/84 pass ✓ (no regression in existing suite)
- Error containment: structurally verified (code review) + runtime-verified (hook pipeline survived 401 auth error in CLI run) ✓
- AC-04: hook lifecycle confirmed via CLI (`session.start`, pane open, `ctx:ok`, `turn.complete`, `ctx:N/A` on null context) ✓ partial
- Performance measurement remains an open item — requires live authenticated Claude Desktop session
- Manual scenarios AC-05 through AC-10 (B–E + perf) must be run before the Mod is distributed beyond the author's own machine

**Constraint**: the headless CLI (`claude --plugin-dir`) cannot authenticate against the Anthropic API (`apiKeySource: none`). Scenarios B–E require an interactive Claude Desktop session with the user logged in.

The Mod is **safe to run** in its current environment. It is **not ready for public distribution** until the runtime validation matrix is complete.
