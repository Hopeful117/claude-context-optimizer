// ES-008: tests for evidenceLine formatting — ANO-002.

import { expect, test } from 'claude-code/testing';
import { evidenceLine } from './format';

// ============================================================
// Default unit (absent or '%') — absolute percentage
// ============================================================

test('evidenceLine: percentage value without valueUnit shows %', () => {
  const result = evidenceLine({ metric: 'contextPercent', observedValue: 85 });
  expect(result).toBe('contextPercent: 85%');
});

test('evidenceLine: percentage value with explicit valueUnit % shows %', () => {
  const result = evidenceLine({ metric: 'contextPercent', observedValue: 85, valueUnit: '%' });
  expect(result).toBe('contextPercent: 85%');
});

test('evidenceLine: percentage with threshold', () => {
  const result = evidenceLine({ metric: 'contextPercent', observedValue: 85, threshold: 85 });
  expect(result).toBe('contextPercent: 85%  · threshold: 85%');
});

test('evidenceLine: percentage with sampleCount=1 — no turns suffix', () => {
  const result = evidenceLine({ metric: 'contextPercent', observedValue: 85, sampleCount: 1 });
  expect(result).toBe('contextPercent: 85%');
});

test('evidenceLine: percentage with sampleCount>1 — appends turns', () => {
  const result = evidenceLine({ metric: 'cacheReadRatio', observedValue: 12, threshold: 30, sampleCount: 5 });
  expect(result).toBe('cacheReadRatio: 12%  · threshold: 30%  · 5 turns');
});

// ============================================================
// 'pp' unit — percentage-point delta (ANO-002 fix)
// ============================================================

test('evidenceLine: pp positive delta shows + prefix and pp suffix', () => {
  const result = evidenceLine({ metric: 'contextPercentDelta', observedValue: 17, valueUnit: 'pp' });
  expect(result).toBe('contextPercentDelta: +17 pp');
});

test('evidenceLine: pp negative delta shows negative value and pp suffix', () => {
  const result = evidenceLine({ metric: 'contextPercentDelta', observedValue: -5, valueUnit: 'pp' });
  expect(result).toBe('contextPercentDelta: -5 pp');
});

test('evidenceLine: pp zero delta', () => {
  const result = evidenceLine({ metric: 'contextPercentDelta', observedValue: 0, valueUnit: 'pp' });
  expect(result).toBe('contextPercentDelta: +0 pp');
});

test('evidenceLine: pp with threshold also uses pp unit', () => {
  const result = evidenceLine({ metric: 'contextPercentDelta', observedValue: 17, valueUnit: 'pp', threshold: 15 });
  expect(result).toBe('contextPercentDelta: +17 pp  · threshold: 15 pp');
});

test('evidenceLine: pp with threshold and sampleCount', () => {
  const result = evidenceLine({
    metric: 'contextPercentDelta',
    observedValue: 17,
    valueUnit: 'pp',
    threshold: 15,
    sampleCount: 3,
  });
  expect(result).toBe('contextPercentDelta: +17 pp  · threshold: 15 pp  · 3 turns');
});

// ============================================================
// Rate limit evidence (uses metric=kind string, no valueUnit)
// ============================================================

test('evidenceLine: rate limit uses % (default)', () => {
  const result = evidenceLine({ metric: 'requests', observedValue: 92, threshold: 90, sampleCount: 1 });
  expect(result).toBe('requests: 92%  · threshold: 90%');
});

// ============================================================
// No threshold, no sampleCount
// ============================================================

test('evidenceLine: no optional fields', () => {
  expect(evidenceLine({ metric: 'contextPercent', observedValue: 72 })).toBe('contextPercent: 72%');
});
