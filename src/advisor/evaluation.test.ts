// ES-006 evaluation test suite — 12 representative scenarios.
// Each scenario validates both the recommendation outcome and, where applicable,
// the structured evidence fields. These are deterministic, timing-free tests.

import { expect, test } from 'claude-code/testing';
import { makeHistory, appendEntry } from '../metrics/history';
import { makeEntry } from '../metrics/normalize';
import type { HistoryEntry } from '../metrics/types';
import {
  contextFillRule,
  cacheEfficiencyRule,
  contextGrowthRule,
  rateLimitRule,
  CONTEXT_FILL_HIGH,
  CONTEXT_FILL_MEDIUM,
  CONTEXT_GROWTH_RAPID_DELTA,
  CONTEXT_GROWTH_MIN_TURNS,
  CACHE_EFFICIENCY_MIN_TURNS,
  CACHE_EFFICIENCY_LOW_RATIO,
  RATE_LIMIT_HIGH,
  RATE_LIMIT_MEDIUM,
} from './rules';
import { evaluate } from './engine';

// --- Shared helpers ---

function turn(
  pct: number | null,
  cacheRead = 500,
  input = 500,
  ts = 0,
  isSubagent = false,
): HistoryEntry {
  return makeEntry({
    kind: 'turn',
    timestampMs: ts,
    sessionId: 's1',
    context: {
      tokens: pct !== null ? Math.round(pct * 2000) : undefined,
      window: 200000,
      percent: pct ?? undefined,
    },
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

function compact(ts = 0): HistoryEntry {
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

function historyOf(...entries: HistoryEntry[]) {
  let h = makeHistory('s1');
  for (const e of entries) h = appendEntry(h, e);
  return h;
}

// ============================================================
// S-01 — Short session, stable context (2 turns, 40–50%)
// No recommendations expected.
// ============================================================

test('S-01: short stable session — all rules null', () => {
  const h = historyOf(turn(40, 500, 500, 0), turn(50, 500, 500, 1));
  expect(contextFillRule(h)).toBeNull();
  expect(contextGrowthRule(h)).toBeNull();
  // 2 turns → below CACHE_EFFICIENCY_MIN_TURNS
  expect(cacheEfficiencyRule(h)).toBeNull();
  expect(rateLimitRule([])).toBeNull();
});

// ============================================================
// S-02 — Progressive growth, 5 turns (5% per turn)
// Delta over last 3 turns: 10% → no growth warning.
// Fill reaches 60% → below 70% medium threshold → no fill recommendation.
// ============================================================

test('S-02: progressive growth 5% per turn — no warning', () => {
  const h = historyOf(
    turn(40, 500, 500, 0),
    turn(45, 500, 500, 1),
    turn(50, 500, 500, 2),
    turn(55, 500, 500, 3),
    turn(60, 500, 500, 4),
  );
  // last 3 turns: 50 → 55 → 60, delta = 10 < CONTEXT_GROWTH_RAPID_DELTA (15)
  expect(contextGrowthRule(h)).toBeNull();
  expect(contextFillRule(h)).toBeNull();
});

// ============================================================
// S-03 — Rapid growth across 3 turns (delta ≥ 15%)
// context-growth-rapid expected; evidence contains delta and sampleCount.
// ============================================================

test('S-03: rapid growth across 3 turns — warning with evidence', () => {
  const delta = CONTEXT_GROWTH_RAPID_DELTA + 2; // 17%
  const h = historyOf(
    turn(50, 500, 500, 0),
    turn(58, 500, 500, 1),
    turn(50 + delta, 500, 500, 2),
  );
  const r = contextGrowthRule(h);
  expect(r?.id).toBe('context-growth-rapid');
  expect(r?.category).toBe('warning');
  expect(r?.confidence).toBe('medium');

  const ev = r?.evidence?.[0];
  expect(ev?.metric).toBe('contextPercentDelta');
  expect(ev?.observedValue).toBe(delta);
  expect(ev?.threshold).toBe(CONTEXT_GROWTH_RAPID_DELTA);
  expect(ev?.sampleCount).toBe(CONTEXT_GROWTH_MIN_TURNS);
});

// ============================================================
// S-04 — High fill (90%), stable (5 turns, low delta per turn)
// context-fill-high expected; context-growth-rapid must NOT fire.
// ============================================================

test('S-04: high fill stable — fill warning, no growth warning', () => {
  // 90% over 5 turns but only small fluctuations (1–2% per turn)
  const h = historyOf(
    turn(88, 500, 500, 0),
    turn(89, 500, 500, 1),
    turn(90, 500, 500, 2),
    turn(91, 500, 500, 3),
    turn(90, 500, 500, 4),
  );
  const fill = contextFillRule(h);
  expect(fill?.id).toBe('context-fill-high');
  expect(fill?.evidence?.[0]?.metric).toBe('contextPercent');
  expect(fill?.evidence?.[0]?.observedValue).toBe(90);
  expect(fill?.evidence?.[0]?.threshold).toBe(CONTEXT_FILL_HIGH);
  expect(fill?.evidence?.[0]?.sampleCount).toBe(1);

  // last 3 turns: 90→91→90, delta = 0 → no growth warning
  expect(contextGrowthRule(h)).toBeNull();
});

// ============================================================
// S-05 — Manual compaction
// High pre-compaction fill → after compact: no fill/growth recommendation.
// ============================================================

test('S-05: post-compaction — no fill/growth recommendations', () => {
  const h = historyOf(
    turn(90, 500, 500, 0),
    turn(92, 500, 500, 1),
    turn(94, 500, 500, 2),
    compact(3),
    // No new turns yet — only the compaction entry in the new window
  );
  expect(contextFillRule(h)).toBeNull();
  expect(contextGrowthRule(h)).toBeNull();
  expect(cacheEfficiencyRule(h)).toBeNull();
});

test('S-05b: post-compaction with 1 new turn — still no growth (insufficient)', () => {
  const h = historyOf(
    turn(90, 500, 500, 0),
    compact(1),
    turn(10, 500, 500, 2), // post-compact: low fill, only 1 turn
  );
  expect(contextFillRule(h)).toBeNull();
  expect(contextGrowthRule(h)).toBeNull();
});

// ============================================================
// S-06 — Subagent turns mixed with 2 main-session turns
// Growth and cache rules should ignore subagent turns.
// 2 main turns < CONTEXT_GROWTH_MIN_TURNS → no growth warning.
// ============================================================

test('S-06: mixed subagent/main turns — growth/cache rules ignore subagents', () => {
  const h = historyOf(
    turn(50, 100, 900, 0, false),  // main
    turn(55, 100, 900, 1, true),   // subagent
    turn(60, 100, 900, 2, true),   // subagent
    turn(65, 100, 900, 3, true),   // subagent
    turn(70, 100, 900, 4, false),  // main
  );
  // Only 2 main-session turns → growth requires 3 → null
  expect(contextGrowthRule(h)).toBeNull();

  // Only 2 non-subagent turns → cache requires CACHE_EFFICIENCY_MIN_TURNS (3) → null
  expect(cacheEfficiencyRule(h)).toBeNull();

  // Fill rule uses most recent entry (subagent at 70% but that IS main context)
  // 70% >= CONTEXT_FILL_MEDIUM → observation
  const fill = contextFillRule(h);
  expect(fill?.id).toBe('context-fill-medium');
});

// ============================================================
// S-07 — Low cache read ratio, only 2 turns (insufficient sample)
// Must return null — not enough data.
// ============================================================

test('S-07: low cache ratio, only 2 turns — null (insufficient sample)', () => {
  const h = historyOf(
    turn(50, 10, 990, 0),  // ratio: 10 / 1000 = 1%
    turn(55, 10, 990, 1),
  );
  // 2 < CACHE_EFFICIENCY_MIN_TURNS (3)
  expect(cacheEfficiencyRule(h)).toBeNull();
});

// ============================================================
// S-08 — Low cache read ratio, sustained (5+ turns)
// cache-efficiency-low expected; evidence shows ratio% and sampleCount.
// ============================================================

test('S-08: low cache ratio, 5 turns — observation with evidence', () => {
  // cacheRead = 10, input = 990 → ratio = 10/1000 = 1% < 30%
  const turns = Array.from({ length: 5 }, (_, i) => turn(50, 10, 990, i));
  const h = historyOf(...turns);
  const r = cacheEfficiencyRule(h);
  expect(r?.id).toBe('cache-efficiency-low');
  expect(r?.category).toBe('observation');
  expect(r?.confidence).toBe('low');

  const ev = r?.evidence?.[0];
  expect(ev?.metric).toBe('cacheReadRatio');
  expect(ev?.observedValue).toBe(1); // 1%
  expect(ev?.threshold).toBe(Math.round(CACHE_EFFICIENCY_LOW_RATIO * 100)); // 30
  expect(ev?.sampleCount).toBe(5);
});

// ============================================================
// S-09 — High cache read ratio (5+ turns)
// No recommendation expected.
// ============================================================

test('S-09: high cache ratio, 5 turns — null', () => {
  // cacheRead = 800, input = 200 → ratio = 800/1000 = 80% > 30%
  const turns = Array.from({ length: 5 }, (_, i) => turn(50, 800, 200, i));
  expect(cacheEfficiencyRule(historyOf(...turns))).toBeNull();
});

// ============================================================
// S-10 — Rate limit near saturation
// rate-limit-high expected; evidence includes kind, observedValue, threshold.
// ============================================================

test('S-10: rate limit at 92% — warning with evidence', () => {
  const r = rateLimitRule([{ kind: 'rpm', percentUsed: 92 }]);
  expect(r?.id).toBe('rate-limit-high');
  expect(r?.category).toBe('warning');
  expect(r?.confidence).toBe('high');

  const ev = r?.evidence?.[0];
  expect(ev?.metric).toBe('rpm');
  expect(ev?.observedValue).toBe(92);
  expect(ev?.threshold).toBe(RATE_LIMIT_HIGH);
  expect(ev?.sampleCount).toBe(1);
});

test('S-10b: rate limit at 76% — observation with evidence', () => {
  const r = rateLimitRule([{ kind: 'rpd', percentUsed: 76 }]);
  expect(r?.id).toBe('rate-limit-medium');
  expect(r?.evidence?.[0]?.threshold).toBe(RATE_LIMIT_MEDIUM);
});

// ============================================================
// S-11 — Missing or partial data (all-null contextPercent)
// All rules must return null gracefully.
// ============================================================

test('S-11: all-null contextPercent turns — all rules null', () => {
  const h = historyOf(
    turn(null, 100, 900, 0),
    turn(null, 100, 900, 1),
    turn(null, 100, 900, 2),
    turn(null, 100, 900, 3),
    turn(null, 100, 900, 4),
  );
  expect(contextFillRule(h)).toBeNull();
  expect(contextGrowthRule(h)).toBeNull();
  // cacheEfficiencyRule does not require contextPercent — it may still fire
  // (turns have turnUsage with low cache ratio here). Verify it handles null gracefully.
  expect(() => cacheEfficiencyRule(h)).not.toThrow();
});

test('S-11b: empty history — all rules null', () => {
  const h = makeHistory('s1');
  expect(contextFillRule(h)).toBeNull();
  expect(contextGrowthRule(h)).toBeNull();
  expect(cacheEfficiencyRule(h)).toBeNull();
  expect(rateLimitRule([])).toBeNull();
});

// ============================================================
// S-12 — Session reset (fresh history)
// A new makeHistory must have zero entries and produce no recommendations.
// ============================================================

test('S-12: fresh history after reset — all null, no contamination', () => {
  // Build a history that would trigger every rule
  let old = makeHistory('session-old');
  for (let i = 0; i < 10; i++) {
    old = appendEntry(old, turn(CONTEXT_FILL_HIGH + 2, 10, 990, i));
  }
  // Simulate session reset
  const fresh = makeHistory('session-new');
  expect(fresh.entries.length).toBe(0);
  expect(contextFillRule(fresh)).toBeNull();
  expect(contextGrowthRule(fresh)).toBeNull();
  expect(cacheEfficiencyRule(fresh)).toBeNull();
  expect(rateLimitRule([])).toBeNull();
});

// ============================================================
// Evidence fields — contextFillRule medium threshold
// ============================================================

test('contextFillRule: medium threshold — evidence uses CONTEXT_FILL_MEDIUM', () => {
  const h = historyOf(turn(CONTEXT_FILL_MEDIUM, 500, 500, 0));
  const r = contextFillRule(h);
  expect(r?.id).toBe('context-fill-medium');
  const ev = r?.evidence?.[0];
  expect(ev?.metric).toBe('contextPercent');
  expect(ev?.observedValue).toBe(CONTEXT_FILL_MEDIUM);
  expect(ev?.threshold).toBe(CONTEXT_FILL_MEDIUM);
});

// ============================================================
// Engine integration — evaluate() propagates evidence
// ============================================================

test('evaluate: recommendations carry evidence', () => {
  let h = makeHistory('s1');
  h = appendEntry(h, turn(CONTEXT_FILL_HIGH, 500, 500, 0));
  const result = evaluate(h);
  const rec = result.recommendations[0];
  expect(rec?.id).toBe('context-fill-high');
  expect(Array.isArray(rec?.evidence)).toBe(true);
  expect(rec?.evidence?.[0]?.metric).toBe('contextPercent');
});
