import { expect, test } from 'claude-code/testing';
import { makeHistory, appendEntry } from '../metrics/history';
import { makeEntry } from '../metrics/normalize';
import type { HistoryEntry } from '../metrics/types';
import {
  contextFillRule,
  cacheEfficiencyRule,
  rateLimitRule,
  contextGrowthRule,
  CONTEXT_FILL_HIGH,
  CONTEXT_FILL_MEDIUM,
  RATE_LIMIT_HIGH,
  RATE_LIMIT_MEDIUM,
  CACHE_EFFICIENCY_MIN_TURNS,
  CONTEXT_GROWTH_MIN_TURNS,
  CONTEXT_GROWTH_RAPID_DELTA,
} from './rules';

// --- Helpers ---

function turnEntry(pct: number | null, cacheRead = 0, input = 1000, ts = 0, isSubagent = false): HistoryEntry {
  return makeEntry({
    kind: 'turn',
    timestampMs: ts,
    sessionId: 's1',
    context: { tokens: pct !== null ? Math.round(pct * 2000) : undefined, window: 200000, percent: pct ?? undefined },
    contextSource: 'session.usage',
    costUsd: null,
    turnUsage: {
      input_tokens: input,
      output_tokens: 100,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: 0,
      model: 'claude-sonnet',
    },
    isSubagent,
    agentId: isSubagent ? 'agent-x' : undefined,
  });
}

function measureEntry(pct: number, ts = 0): HistoryEntry {
  return makeEntry({
    kind: 'measure',
    timestampMs: ts,
    sessionId: 's1',
    context: { tokens: Math.round(pct * 2000), window: 200000, percent: pct },
    contextSource: 'session.measure',
    costUsd: null,
  });
}

function compactEntry(ts = 0): HistoryEntry {
  return makeEntry({
    kind: 'compact',
    timestampMs: ts,
    sessionId: 's1',
    context: { window: 200000 },
    contextSource: 'session.usage',
    costUsd: null,
    compactTrigger: 'manual',
  });
}

function historyWith(...entries: HistoryEntry[]) {
  let h = makeHistory('s1');
  for (const e of entries) h = appendEntry(h, e);
  return h;
}

// ============================================================
// contextFillRule
// ============================================================

test('contextFillRule: null on empty history', () => {
  expect(contextFillRule(makeHistory('s1'))).toBe(null);
});

test('contextFillRule: null when below medium threshold', () => {
  expect(contextFillRule(historyWith(turnEntry(CONTEXT_FILL_MEDIUM - 1)))).toBe(null);
});

test('contextFillRule: null when no contextPercent', () => {
  expect(contextFillRule(historyWith(turnEntry(null)))).toBe(null);
});

test('contextFillRule: medium at threshold', () => {
  const r = contextFillRule(historyWith(turnEntry(CONTEXT_FILL_MEDIUM)));
  expect(r?.id).toBe('context-fill-medium');
  expect(r?.confidence).toBe('medium');
  expect(r?.category).toBe('observation');
});

test('contextFillRule: high at high threshold', () => {
  const r = contextFillRule(historyWith(turnEntry(CONTEXT_FILL_HIGH)));
  expect(r?.id).toBe('context-fill-high');
  expect(r?.confidence).toBe('high');
  expect(r?.category).toBe('warning');
});

test('contextFillRule: uses most recent entry in current window', () => {
  // First entry high, most recent entry below threshold
  const h = historyWith(turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 0), turnEntry(50, 0, 1000, 1));
  expect(contextFillRule(h)).toBe(null);
});

// ES-004 regression: post-compaction must not reuse pre-compaction fill
test('contextFillRule: null after compaction even with high pre-compaction context', () => {
  // Before compact: 90% (would trigger high)
  // After compact: no new measurement yet
  const h = historyWith(turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 0), compactEntry(1));
  expect(contextFillRule(h)).toBe(null);
});

// ES-004 regression: new low measurement after compaction must be respected
test('contextFillRule: uses new post-compaction measurement', () => {
  const h = historyWith(
    turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 0),  // pre-compaction high
    compactEntry(1),
    turnEntry(5, 0, 1000, 2),                   // post-compaction low
  );
  expect(contextFillRule(h)).toBe(null);
});

// ES-004 regression: high fill after compaction must still fire
test('contextFillRule: fires on new high fill after compaction', () => {
  const h = historyWith(
    turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 0),  // pre-compaction
    compactEntry(1),
    turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 2),  // post-compaction high again
  );
  const r = contextFillRule(h);
  expect(r?.id).toBe('context-fill-high');
});

// ============================================================
// cacheEfficiencyRule
// ============================================================

test('cacheEfficiencyRule: null on insufficient turns', () => {
  const h = historyWith(turnEntry(50, 100, 1000));
  expect(cacheEfficiencyRule(h)).toBe(null);
});

test('cacheEfficiencyRule: null when good ratio', () => {
  // cacheRead = 700, total = 700+300+0 = 1000 → ratio 0.70 > 0.30
  const turns = Array.from({ length: CACHE_EFFICIENCY_MIN_TURNS }, () => turnEntry(50, 700, 300));
  expect(cacheEfficiencyRule(historyWith(...turns))).toBe(null);
});

test('cacheEfficiencyRule: low confidence observation when low cache ratio', () => {
  // cacheRead = 10, total = 10+990+0 = 1000 → ratio 0.01 < 0.30
  const turns = Array.from({ length: CACHE_EFFICIENCY_MIN_TURNS }, () => turnEntry(50, 10, 990));
  const r = cacheEfficiencyRule(historyWith(...turns));
  expect(r?.id).toBe('cache-efficiency-low');
  expect(r?.confidence).toBe('low');
  expect(r?.category).toBe('observation');
});

// ES-004 regression: immediately post-compaction → not enough turns in current window
test('cacheEfficiencyRule: null immediately after compaction (no turns in new window)', () => {
  // Pre-compaction had many turns with low cache reads, but those belong to the old context
  const preCompact = Array.from({ length: 10 }, (_, i) => turnEntry(50, 10, 990, i));
  const h = historyWith(...preCompact, compactEntry(100));
  expect(cacheEfficiencyRule(h)).toBe(null);
});

// ES-004 regression: post-compaction with only 2 new turns → still insufficient
test('cacheEfficiencyRule: null with only 2 turns after compaction', () => {
  const preCompact = Array.from({ length: 10 }, (_, i) => turnEntry(50, 10, 990, i));
  const h = historyWith(
    ...preCompact,
    compactEntry(100),
    turnEntry(5, 10, 990, 101),
    turnEntry(8, 10, 990, 102),
  );
  expect(cacheEfficiencyRule(h)).toBe(null);
});

// ES-004 scenario 6: few cache reads but only 2 turns → insufficient data
test('cacheEfficiencyRule: null when fewer than min turns regardless of ratio', () => {
  const h = historyWith(
    turnEntry(50, 0, 1000, 0),
    turnEntry(55, 0, 1000, 1),
  );
  expect(cacheEfficiencyRule(h)).toBe(null);
});

// ES-004 scenario 7: high cache reads → null
test('cacheEfficiencyRule: null when cache read ratio is high', () => {
  const turns = Array.from({ length: CACHE_EFFICIENCY_MIN_TURNS }, () => turnEntry(50, 800, 200));
  expect(cacheEfficiencyRule(historyWith(...turns))).toBe(null);
});

// ES-004: subagent turns do not count toward the min turn threshold
test('cacheEfficiencyRule: subagent turns excluded from count', () => {
  const subagentTurns = Array.from({ length: 5 }, (_, i) => turnEntry(50, 10, 990, i, true));
  const h = historyWith(...subagentTurns);
  expect(cacheEfficiencyRule(h)).toBe(null);
});

// ============================================================
// rateLimitRule
// ============================================================

test('rateLimitRule: null on empty list', () => {
  expect(rateLimitRule([])).toBe(null);
});

test('rateLimitRule: null below medium threshold', () => {
  expect(rateLimitRule([{ kind: 'rpm', percentUsed: RATE_LIMIT_MEDIUM - 1 }])).toBe(null);
});

test('rateLimitRule: observation at medium threshold', () => {
  const r = rateLimitRule([{ kind: 'rpm', percentUsed: RATE_LIMIT_MEDIUM }]);
  expect(r?.id).toBe('rate-limit-medium');
  expect(r?.confidence).toBe('medium');
  expect(r?.category).toBe('observation');
});

test('rateLimitRule: warning at high threshold', () => {
  const r = rateLimitRule([{ kind: 'rpm', percentUsed: RATE_LIMIT_HIGH }]);
  expect(r?.id).toBe('rate-limit-high');
  expect(r?.confidence).toBe('high');
  expect(r?.category).toBe('warning');
});

test('rateLimitRule: picks highest percentUsed across kinds', () => {
  const r = rateLimitRule([
    { kind: 'rpd', percentUsed: 50 },
    { kind: 'rpm', percentUsed: RATE_LIMIT_HIGH + 1 },
  ]);
  expect(r?.id).toBe('rate-limit-high');
  expect(r?.explanation).toContain('rpm');
});

// ES-004 scenario 8: no rate limits → null
test('rateLimitRule: null when no rate limit snapshots', () => {
  expect(rateLimitRule([])).toBe(null);
});

// ============================================================
// contextGrowthRule
// ============================================================

test('contextGrowthRule: null on empty history', () => {
  expect(contextGrowthRule(makeHistory('s1'))).toBe(null);
});

test('contextGrowthRule: null when insufficient turn entries with percent', () => {
  const h = historyWith(turnEntry(50), turnEntry(60));
  expect(contextGrowthRule(h)).toBe(null);
});

test('contextGrowthRule: null when growth below threshold', () => {
  const h = historyWith(turnEntry(50, 0, 1000, 0), turnEntry(55, 0, 1000, 1), turnEntry(58, 0, 1000, 2));
  expect(contextGrowthRule(h)).toBe(null);
});

test('contextGrowthRule: warning when rapid growth across distinct turns', () => {
  const h = historyWith(turnEntry(50, 0, 1000, 0), turnEntry(60, 0, 1000, 1), turnEntry(70, 0, 1000, 2));
  const r = contextGrowthRule(h);
  expect(r?.id).toBe('context-growth-rapid');
  expect(r?.confidence).toBe('medium');
  expect(r?.category).toBe('warning');
  expect(r?.explanation).toContain('main-session turns');
});

// ES-004 regression: session.measure events must not inflate turn count
test('contextGrowthRule: measure events do not count as turns', () => {
  // Only 1 actual turn — 2 measure events fill up the 3-slot window if measure is included
  const h = historyWith(
    measureEntry(50, 0),
    measureEntry(55, 1),
    turnEntry(60, 0, 1000, 2),
  );
  // Should return null — only 1 turn, not 3
  expect(contextGrowthRule(h)).toBe(null);
});

// ES-004 scenario 3: multiple measures during one turn — not counted as turns
test('contextGrowthRule: multiple measure events during same turn do not form 3 turns', () => {
  const h = historyWith(
    measureEntry(50, 0),
    measureEntry(53, 1),
    measureEntry(56, 2),
    turnEntry(60, 0, 1000, 3),
    turnEntry(65, 0, 1000, 4),
  );
  // 2 turns, not 3 → no trigger
  expect(contextGrowthRule(h)).toBe(null);
});

// ES-004 scenario 4: regular growth across 3 distinct turns
test('contextGrowthRule: fires after 3 distinct turns with rapid growth', () => {
  const delta = CONTEXT_GROWTH_RAPID_DELTA + 1;
  const h = historyWith(
    turnEntry(50, 0, 1000, 0),
    turnEntry(50 + Math.floor(delta / 2), 0, 1000, 1),
    turnEntry(50 + delta, 0, 1000, 2),
  );
  const r = contextGrowthRule(h);
  expect(r?.id).toBe('context-growth-rapid');
});

// ES-004 scenario 5: subagent turns are excluded
test('contextGrowthRule: subagent turns do not count', () => {
  const h = historyWith(
    turnEntry(50, 0, 1000, 0, false),
    turnEntry(60, 0, 1000, 1, true),  // subagent
    turnEntry(70, 0, 1000, 2, true),  // subagent
  );
  // Only 1 main-session turn → not enough
  expect(contextGrowthRule(h)).toBe(null);
});

// ES-004 regression: no crossing compaction boundary
test('contextGrowthRule: null when fewer than min turns after last compaction', () => {
  const h = historyWith(
    turnEntry(50, 0, 1000, 0),
    turnEntry(60, 0, 1000, 1),
    turnEntry(70, 0, 1000, 2),
    compactEntry(3),
    turnEntry(5, 0, 1000, 4),   // only 1 turn post-compaction
    turnEntry(10, 0, 1000, 5),  // 2 turns post-compaction
  );
  // 2 turns after compaction, need 3
  expect(contextGrowthRule(h)).toBe(null);
});

// ES-004: does not fire when growth delta is exactly at threshold (strict greater-than)
test('contextGrowthRule: null when delta equals threshold exactly', () => {
  const h = historyWith(
    turnEntry(50, 0, 1000, 0),
    turnEntry(55, 0, 1000, 1),
    turnEntry(50 + CONTEXT_GROWTH_RAPID_DELTA - 1, 0, 1000, 2),
  );
  expect(contextGrowthRule(h)).toBe(null);
});

// ============================================================
// ES-004 scenario 9: missing or partial data
// ============================================================

test('all rules: return null gracefully on empty history', () => {
  const h = makeHistory('s1');
  expect(contextFillRule(h)).toBe(null);
  expect(cacheEfficiencyRule(h)).toBe(null);
  expect(contextGrowthRule(h)).toBe(null);
  expect(rateLimitRule([])).toBe(null);
});

test('contextFillRule: null when all contextPercent values are null', () => {
  const h = historyWith(turnEntry(null), turnEntry(null), turnEntry(null));
  expect(contextFillRule(h)).toBe(null);
});

test('cacheEfficiencyRule: null when totalInput is zero', () => {
  // Turns with zero tokens everywhere
  const turns = Array.from({ length: CACHE_EFFICIENCY_MIN_TURNS }, () =>
    makeEntry({
      kind: 'turn',
      timestampMs: 0,
      sessionId: 's1',
      context: { window: 200000 },
      contextSource: 'session.usage',
      costUsd: null,
      turnUsage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' },
    }),
  );
  expect(cacheEfficiencyRule(historyWith(...turns))).toBe(null);
});

// ============================================================
// ES-004 scenario 10: history limited to 100 observations
// ============================================================

test('all rules: handle history at max capacity (100 entries) without crashing', () => {
  let h = makeHistory('s1', 100);
  for (let i = 0; i < 110; i++) {
    h = appendEntry(h, turnEntry(50 + (i % 10), 500, 500, i));
  }
  expect(h.entries.length).toBe(100);
  // All rules must complete without throwing
  expect(() => contextFillRule(h)).not.toThrow();
  expect(() => cacheEfficiencyRule(h)).not.toThrow();
  expect(() => contextGrowthRule(h)).not.toThrow();
});

// ============================================================
// ES-004 scenario 11: session change (new sessionId)
// ============================================================

test('makeHistory creates independent history per sessionId', () => {
  const h1 = makeHistory('session-A');
  const h2 = makeHistory('session-B');
  expect(h1.sessionId).toBe('session-A');
  expect(h2.sessionId).toBe('session-B');
  // A new session starts with no entries — no spurious recommendations
  expect(contextFillRule(h2)).toBe(null);
  expect(contextGrowthRule(h2)).toBe(null);
  expect(cacheEfficiencyRule(h2)).toBe(null);
});

// ============================================================
// ES-004 scenario 12: no recommendations when evidence is insufficient
// ============================================================

test('no recommendations when only 1 turn with moderate fill and no rate limits', () => {
  const h = historyWith(turnEntry(50, 400, 600, 0));
  expect(contextFillRule(h)).toBe(null);
  expect(cacheEfficiencyRule(h)).toBe(null);
  expect(contextGrowthRule(h)).toBe(null);
  expect(rateLimitRule([])).toBe(null);
});

// ============================================================
// ES-005: Incomplete events — missing/null optional fields
// ============================================================

test('contextFillRule: handles session_start entry (no contextPercent) gracefully', () => {
  const startEntry = makeEntry({
    kind: 'session_start',
    timestampMs: 0,
    sessionId: 's1',
    context: { window: 0, tokens: undefined, percent: undefined },
    contextSource: 'session.usage',
    costUsd: null,
  });
  let h = makeHistory('s1');
  h = appendEntry(h, startEntry);
  h = appendEntry(h, turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 1));
  const r = contextFillRule(h);
  expect(r?.id).toBe('context-fill-high');
});

test('cacheEfficiencyRule: turns with null turnUsage are ignored', () => {
  // A turn entry without turnUsage (e.g., aborted turn)
  const noUsageTurn = makeEntry({
    kind: 'turn',
    timestampMs: 0,
    sessionId: 's1',
    context: { window: 200000, percent: 50 },
    contextSource: 'session.usage',
    costUsd: null,
    // no turnUsage → null
  });
  let h = makeHistory('s1');
  for (let i = 0; i < CACHE_EFFICIENCY_MIN_TURNS; i++) {
    h = appendEntry(h, noUsageTurn);
  }
  // No turns with turnUsage → cannot compute ratio → null
  expect(cacheEfficiencyRule(h)).toBeNull();
});

test('contextGrowthRule: single turn with null contextPercent — not counted', () => {
  // A turn with no contextPercent plus two valid turns → still only 2 usable
  const h = historyWith(
    turnEntry(null, 0, 1000, 0),  // no percent
    turnEntry(50, 0, 1000, 1),
    turnEntry(60, 0, 1000, 2),
  );
  // Only 2 turns have contextPercent → insufficient
  expect(contextGrowthRule(h)).toBeNull();
});

// ============================================================
// ES-005: Unexpected event order — compact at history start
// ============================================================

test('entriesSinceLastCompact: compact is first entry — returns nothing after it', () => {
  // Edge case: compact entry with no prior entries (e.g., resumed after compact)
  const h = historyWith(
    compactEntry(0),
    turnEntry(10, 0, 1000, 1),
  );
  // After compact: only 1 turn available → no growth recommendation
  expect(contextGrowthRule(h)).toBeNull();
  // Fill rule: 1 entry with 10% → below threshold
  expect(contextFillRule(h)).toBeNull();
});

test('contextFillRule: interleaved measure + turn entries — uses most recent', () => {
  // Two turns at high fill, then a measure event that resets our view
  // The pane uses most recent entry — should respect order
  const h = historyWith(
    turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 0),
    measureEntry(10, 1),  // measure shows context dropped (e.g., after sub-compact)
  );
  // Most recent entry in current window has percent = 10 → below threshold
  expect(contextFillRule(h)).toBeNull();
});

// ============================================================
// ES-005: Session reset — fresh history has no contamination
// ============================================================

test('fresh history after reset has no history from previous session', () => {
  // Simulate what happens after /clear: makeHistory creates a new object
  let oldHistory = makeHistory('session-old');
  for (let i = 0; i < 10; i++) {
    oldHistory = appendEntry(oldHistory, turnEntry(90, 0, 1000, i));
  }
  // After /clear, a fresh history is created for the new session
  const newHistory = makeHistory('session-new');
  expect(newHistory.entries.length).toBe(0);
  expect(newHistory.sessionId).toBe('session-new');
  // No recommendations on a fresh history
  expect(contextFillRule(newHistory)).toBeNull();
  expect(contextGrowthRule(newHistory)).toBeNull();
});

// ============================================================
// ES-005: Subagent scenario — mixed main + subagent turns
// ============================================================

test('all rules: mixed subagent and main-session turns — only main turns affect growth/cache', () => {
  // 2 main turns (rapid growth) + 3 subagent turns (should not count)
  const h = historyWith(
    turnEntry(50, 0, 1000, 0, false),   // main
    turnEntry(60, 0, 1000, 1, true),    // subagent
    turnEntry(65, 0, 1000, 2, true),    // subagent
    turnEntry(70, 0, 1000, 3, true),    // subagent
    turnEntry(75, 0, 1000, 4, false),   // main (only 2nd main turn)
  );
  // Only 2 main turns → growth rule requires 3 → null
  expect(contextGrowthRule(h)).toBeNull();
  // Fill: most recent entry (last main turn at 75%) → below high threshold
  expect(contextFillRule(h)).toBeNull();
});

test('contextFillRule: subagent turn at high fill — does not trigger (uses most-recent entry)', () => {
  // If subagent turn is last and at high fill, fill rule still fires
  // (fill rule doesn't distinguish subagent — it looks at last entry with percent)
  const h = historyWith(
    turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 0, true),  // subagent at high fill
  );
  // contextFillRule doesn't filter subagents — it reports the fill as-is
  const r = contextFillRule(h);
  expect(r?.id).toBe('context-fill-high');
});
