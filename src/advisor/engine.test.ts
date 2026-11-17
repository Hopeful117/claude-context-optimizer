import { expect, test } from 'claude-code/testing';
import { makeHistory, appendEntry } from '../metrics/history';
import { makeEntry } from '../metrics/normalize';
import type { HistoryEntry } from '../metrics/types';
import { evaluate } from './engine';
import { CONTEXT_FILL_HIGH, RATE_LIMIT_HIGH } from './rules';

function turnEntry(pct: number | null, ts = 0): HistoryEntry {
  return makeEntry({
    kind: 'turn',
    timestampMs: ts,
    sessionId: 's1',
    context: { tokens: pct !== null ? Math.round(pct * 2000) : undefined, window: 200000, percent: pct ?? undefined },
    contextSource: 'session.usage',
    costUsd: null,
  });
}

test('evaluate: empty history, no rate limits → no recommendations', () => {
  const result = evaluate(makeHistory('s1'));
  expect(result.recommendations.length).toBe(0);
});

test('evaluate: context fill high → one high recommendation', () => {
  let h = makeHistory('s1');
  h = appendEntry(h, turnEntry(CONTEXT_FILL_HIGH));
  const result = evaluate(h);
  expect(result.recommendations[0]?.id).toBe('context-fill-high');
  expect(result.recommendations[0]?.confidence).toBe('high');
});

test('evaluate: recommendations sorted high before medium', () => {
  let h = makeHistory('s1');
  // Add 3 turns with low cache ratio to trigger cacheEfficiency (medium)
  for (let i = 0; i < 3; i++) {
    h = appendEntry(h, makeEntry({
      kind: 'turn',
      timestampMs: i,
      sessionId: 's1',
      context: { tokens: CONTEXT_FILL_HIGH * 2000, window: 200000, percent: CONTEXT_FILL_HIGH },
      contextSource: 'session.usage',
      costUsd: null,
      turnUsage: { input_tokens: 990, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 0, model: 'm' },
    }));
  }
  // Also add a high rate limit
  const result = evaluate(h, [{ kind: 'rpm', percentUsed: RATE_LIMIT_HIGH }]);
  // Both high recommendations should come before any medium ones
  const confidences = result.recommendations.map(r => r.confidence);
  const firstMedium = confidences.indexOf('medium');
  const lastHigh = confidences.lastIndexOf('high');
  if (firstMedium !== -1 && lastHigh !== -1) {
    expect(lastHigh).toBeLessThan(firstMedium);
  }
});

test('evaluate: deduplicates by id', () => {
  let h = makeHistory('s1');
  h = appendEntry(h, turnEntry(CONTEXT_FILL_HIGH));
  const result = evaluate(h);
  const ids = result.recommendations.map(r => r.id);
  const unique = new Set(ids);
  expect(ids.length).toBe(unique.size);
});

test('evaluate: rate limit only → rate limit recommendation', () => {
  const result = evaluate(makeHistory('s1'), [{ kind: 'rpm', percentUsed: RATE_LIMIT_HIGH }]);
  expect(result.recommendations[0]?.id).toBe('rate-limit-high');
});
