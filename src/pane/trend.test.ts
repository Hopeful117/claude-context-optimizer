// ES-007: contextTrend helper tests.

import { expect, test } from 'claude-code/testing';
import { makeHistory, appendEntry } from '../metrics/history';
import { makeEntry } from '../metrics/normalize';
import type { HistoryEntry } from '../metrics/types';
import { contextTrend } from './trend';
import { CONTEXT_GROWTH_MIN_TURNS } from '../advisor/rules';

// --- Helpers ---

function turnEntry(pct: number | null, ts = 0, isSubagent = false): HistoryEntry {
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
    isSubagent,
    agentId: isSubagent ? 'agent-x' : undefined,
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

function historyOf(...entries: HistoryEntry[]) {
  let h = makeHistory('s1');
  for (const e of entries) h = appendEntry(h, e);
  return h;
}

// ============================================================
// N/A conditions
// ============================================================

test('contextTrend: empty history → N/A', () => {
  expect(contextTrend(makeHistory('s1'))).toBe('N/A');
});

test('contextTrend: fewer than min turns → N/A', () => {
  expect(contextTrend(historyOf(turnEntry(50, 0), turnEntry(60, 1)))).toBe('N/A');
});

test('contextTrend: null contextPercent turns do not count → N/A', () => {
  // 1 null turn + 2 valid = 2 total → N/A
  const h = historyOf(turnEntry(null, 0), turnEntry(50, 1), turnEntry(60, 2));
  expect(contextTrend(h)).toBe('N/A');
});

test('contextTrend: subagent turns excluded → N/A when only 2 main turns', () => {
  const h = historyOf(
    turnEntry(50, 0, false),
    turnEntry(55, 1, true),
    turnEntry(60, 2, true),
    turnEntry(65, 3, true),
    turnEntry(70, 4, false),
  );
  // Only 2 main-session turns → N/A
  expect(contextTrend(h)).toBe('N/A');
});

test('contextTrend: post-compaction with 1 new turn → N/A', () => {
  const h = historyOf(
    turnEntry(80, 0), turnEntry(85, 1), turnEntry(90, 2),
    compactEntry(3),
    turnEntry(10, 4),
  );
  expect(contextTrend(h)).toBe('N/A');
});

// ============================================================
// Positive / negative / stable delta
// ============================================================

test('contextTrend: positive delta — shows ↑ and correct percent', () => {
  // turns [50, 60, 70] → delta = 20%
  const h = historyOf(turnEntry(50, 0), turnEntry(60, 1), turnEntry(70, 2));
  const trend = contextTrend(h);
  expect(trend).toContain('↑');
  expect(trend).toContain('+20%');
  expect(trend).toContain(`${CONTEXT_GROWTH_MIN_TURNS} turns`);
});

test('contextTrend: negative delta — shows ↓ and negative percent', () => {
  // Post-compaction context can drop: [80, 70, 60] → delta = -20%
  const h = historyOf(turnEntry(80, 0), turnEntry(70, 1), turnEntry(60, 2));
  const trend = contextTrend(h);
  expect(trend).toContain('↓');
  expect(trend).toContain('-20%');
});

test('contextTrend: zero delta — shows → stable', () => {
  const h = historyOf(turnEntry(60, 0), turnEntry(60, 1), turnEntry(60, 2));
  expect(contextTrend(h)).toContain('→ stable');
});

// ============================================================
// Uses last N turns when history is longer
// ============================================================

test('contextTrend: uses last 3 of 5 turns', () => {
  // All 5: [50, 55, 60, 65, 70] — last 3: [60, 65, 70], delta = 10%
  const h = historyOf(
    turnEntry(50, 0), turnEntry(55, 1), turnEntry(60, 2),
    turnEntry(65, 3), turnEntry(70, 4),
  );
  const trend = contextTrend(h);
  expect(trend).toContain('↑');
  expect(trend).toContain('+10%');
});

// ============================================================
// Cross-compaction boundary
// ============================================================

test('contextTrend: 3 turns post-compaction — uses only current window', () => {
  const h = historyOf(
    turnEntry(80, 0), turnEntry(85, 1), turnEntry(90, 2), // pre-compaction (high)
    compactEntry(3),
    turnEntry(5, 4), turnEntry(10, 5), turnEntry(15, 6),  // post-compaction (low, rising)
  );
  const trend = contextTrend(h);
  // delta = 15-5 = 10%
  expect(trend).toContain('↑');
  expect(trend).toContain('+10%');
});
