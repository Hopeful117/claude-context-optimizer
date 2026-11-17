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
} from './rules';

// --- Helpers ---

function turnEntry(pct: number | null, cacheRead = 0, input = 1000, ts = 0): HistoryEntry {
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
  });
}

function historyWith(...entries: HistoryEntry[]) {
  let h = makeHistory('s1');
  for (const e of entries) h = appendEntry(h, e);
  return h;
}

// --- contextFillRule ---

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
});

test('contextFillRule: high at high threshold', () => {
  const r = contextFillRule(historyWith(turnEntry(CONTEXT_FILL_HIGH)));
  expect(r?.id).toBe('context-fill-high');
  expect(r?.confidence).toBe('high');
});

test('contextFillRule: uses most recent entry', () => {
  // First entry high, most recent entry below threshold
  const h = historyWith(turnEntry(CONTEXT_FILL_HIGH, 0, 1000, 0), turnEntry(50, 0, 1000, 1));
  expect(contextFillRule(h)).toBe(null);
});

// --- cacheEfficiencyRule ---

test('cacheEfficiencyRule: null on insufficient turns', () => {
  const h = historyWith(turnEntry(50, 100, 1000));
  expect(cacheEfficiencyRule(h)).toBe(null);
});

test('cacheEfficiencyRule: null when good ratio', () => {
  // cacheRead = 700, total = 700+300+0 = 1000 → ratio 0.70 > 0.30
  const turns = Array.from({ length: CACHE_EFFICIENCY_MIN_TURNS }, () => turnEntry(50, 700, 300));
  expect(cacheEfficiencyRule(historyWith(...turns))).toBe(null);
});

test('cacheEfficiencyRule: medium when low cache ratio', () => {
  // cacheRead = 10, total = 10+990+0 = 1000 → ratio 0.01 < 0.30
  const turns = Array.from({ length: CACHE_EFFICIENCY_MIN_TURNS }, () => turnEntry(50, 10, 990));
  const r = cacheEfficiencyRule(historyWith(...turns));
  expect(r?.id).toBe('cache-efficiency-low');
  expect(r?.confidence).toBe('medium');
});

// --- rateLimitRule ---

test('rateLimitRule: null on empty list', () => {
  expect(rateLimitRule([])).toBe(null);
});

test('rateLimitRule: null below medium threshold', () => {
  expect(rateLimitRule([{ kind: 'rpm', percentUsed: RATE_LIMIT_MEDIUM - 1 }])).toBe(null);
});

test('rateLimitRule: medium at medium threshold', () => {
  const r = rateLimitRule([{ kind: 'rpm', percentUsed: RATE_LIMIT_MEDIUM }]);
  expect(r?.id).toBe('rate-limit-medium');
  expect(r?.confidence).toBe('medium');
});

test('rateLimitRule: high at high threshold', () => {
  const r = rateLimitRule([{ kind: 'rpm', percentUsed: RATE_LIMIT_HIGH }]);
  expect(r?.id).toBe('rate-limit-high');
  expect(r?.confidence).toBe('high');
});

test('rateLimitRule: picks highest percentUsed across kinds', () => {
  const r = rateLimitRule([
    { kind: 'rpd', percentUsed: 50 },
    { kind: 'rpm', percentUsed: RATE_LIMIT_HIGH + 1 },
  ]);
  expect(r?.id).toBe('rate-limit-high');
  expect(r?.explanation).toContain('rpm');
});

// --- contextGrowthRule ---

test('contextGrowthRule: null on empty history', () => {
  expect(contextGrowthRule(makeHistory('s1'))).toBe(null);
});

test('contextGrowthRule: null when insufficient entries with percent', () => {
  const h = historyWith(turnEntry(50), turnEntry(60));
  expect(contextGrowthRule(h)).toBe(null);
});

test('contextGrowthRule: null when growth below threshold', () => {
  const h = historyWith(turnEntry(50, 0, 1000, 0), turnEntry(55, 0, 1000, 1), turnEntry(58, 0, 1000, 2));
  expect(contextGrowthRule(h)).toBe(null);
});

test('contextGrowthRule: medium when rapid growth', () => {
  const h = historyWith(turnEntry(50, 0, 1000, 0), turnEntry(60, 0, 1000, 1), turnEntry(70, 0, 1000, 2));
  const r = contextGrowthRule(h);
  expect(r?.id).toBe('context-growth-rapid');
  expect(r?.confidence).toBe('medium');
});
