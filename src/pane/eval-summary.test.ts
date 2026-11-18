import { expect, test } from 'claude-code/testing';
import type { EvalLog, EvalEntry } from '../../types';
import { computeEvalSummary } from './eval-summary';

function entry(overrides: Partial<EvalEntry> & { wasGuided: boolean }): EvalEntry {
  return {
    compactionId: 'sess:1',
    trigger: 'manual',
    timestampMs: 1700000000000,
    turnsAtCompaction: 10,
    turnsUntilAnnotation: null,
    userAnnotation: 'skipped',
    ...overrides,
  };
}

function log(entries: EvalEntry[]): EvalLog {
  return { entries, maxEntries: 200 };
}

// ============================================================
// Empty / trivial cases
// ============================================================

test('computeEvalSummary: empty log — all zeros, rates null', () => {
  const s = computeEvalSummary(log([]));
  expect(s.totalEntries).toBe(0);
  expect(s.precomputeExcluded).toBe(0);
  expect(s.groupA.total).toBe(0);
  expect(s.groupA.responseRate).toBeNull();
  expect(s.groupA.satisfactionRate).toBeNull();
  expect(s.groupB.total).toBe(0);
  expect(s.groupB.responseRate).toBeNull();
  expect(s.groupB.satisfactionRate).toBeNull();
});

test('computeEvalSummary: all precompute — both groups empty', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, trigger: 'precompute' }),
    entry({ wasGuided: false, trigger: 'precompute' }),
  ]));
  expect(s.totalEntries).toBe(2);
  expect(s.precomputeExcluded).toBe(2);
  expect(s.groupA.total).toBe(0);
  expect(s.groupB.total).toBe(0);
});

// ============================================================
// Group assignment
// ============================================================

test('computeEvalSummary: wasGuided=false → Group A', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, userAnnotation: 'positive' }),
  ]));
  expect(s.groupA.total).toBe(1);
  expect(s.groupA.positive).toBe(1);
  expect(s.groupB.total).toBe(0);
});

test('computeEvalSummary: wasGuided=true → Group B', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: true, userAnnotation: 'positive' }),
  ]));
  expect(s.groupB.total).toBe(1);
  expect(s.groupB.positive).toBe(1);
  expect(s.groupA.total).toBe(0);
});

// ============================================================
// Annotation counting
// ============================================================

test('computeEvalSummary: all annotation values counted correctly', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, userAnnotation: 'positive' }),
    entry({ wasGuided: false, userAnnotation: 'negative' }),
    entry({ wasGuided: false, userAnnotation: 'dismissed' }),
    entry({ wasGuided: false, userAnnotation: 'skipped' }),
  ]));
  const g = s.groupA;
  expect(g.total).toBe(4);
  expect(g.positive).toBe(1);
  expect(g.negative).toBe(1);
  expect(g.dismissed).toBe(1);
  expect(g.skipped).toBe(1);
  expect(g.annotated).toBe(3); // positive + negative + dismissed
});

test('computeEvalSummary: skipped entries excluded from annotated count', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, userAnnotation: 'skipped' }),
    entry({ wasGuided: false, userAnnotation: 'skipped' }),
  ]));
  expect(s.groupA.annotated).toBe(0);
  expect(s.groupA.responseRate).toBe(0);
  expect(s.groupA.satisfactionRate).toBeNull();
});

// ============================================================
// Rate calculations
// ============================================================

test('computeEvalSummary: responseRate = annotated / total', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, userAnnotation: 'positive' }),
    entry({ wasGuided: false, userAnnotation: 'negative' }),
    entry({ wasGuided: false, userAnnotation: 'skipped' }),
    entry({ wasGuided: false, userAnnotation: 'skipped' }),
  ]));
  // annotated=2, total=4 → 0.5
  expect(s.groupA.responseRate).toBe(0.5);
});

test('computeEvalSummary: satisfactionRate = positive / annotated', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, userAnnotation: 'positive' }),
    entry({ wasGuided: false, userAnnotation: 'positive' }),
    entry({ wasGuided: false, userAnnotation: 'negative' }),
    entry({ wasGuided: false, userAnnotation: 'dismissed' }),
  ]));
  // positive=2, annotated=4 → 0.5
  expect(s.groupA.satisfactionRate).toBe(0.5);
});

test('computeEvalSummary: dismissed does not count as negative in satisfactionRate', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, userAnnotation: 'positive' }),
    entry({ wasGuided: false, userAnnotation: 'dismissed' }),
    entry({ wasGuided: false, userAnnotation: 'dismissed' }),
  ]));
  // positive=1, annotated=3 → 1/3
  // positive=1, annotated=3 → ~0.333
  expect(Math.abs(s.groupA.satisfactionRate! - 1 / 3)).toBeLessThan(0.001);
});

test('computeEvalSummary: satisfactionRate null when annotated=0', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, userAnnotation: 'skipped' }),
  ]));
  expect(s.groupA.satisfactionRate).toBeNull();
});

test('computeEvalSummary: responseRate null when total=0', () => {
  const s = computeEvalSummary(log([]));
  expect(s.groupA.responseRate).toBeNull();
  expect(s.groupB.responseRate).toBeNull();
});

// ============================================================
// Precompute exclusion
// ============================================================

test('computeEvalSummary: precompute excluded from both groups, totalEntries unchanged', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, trigger: 'manual', userAnnotation: 'positive' }),
    entry({ wasGuided: false, trigger: 'precompute', userAnnotation: 'positive' }),
    entry({ wasGuided: true, trigger: 'auto', userAnnotation: 'positive' }),
  ]));
  expect(s.totalEntries).toBe(3);
  expect(s.precomputeExcluded).toBe(1);
  expect(s.groupA.total).toBe(1); // only the manual entry
  expect(s.groupB.total).toBe(1);
});

// ============================================================
// Mixed groups
// ============================================================

test('computeEvalSummary: mixed groups computed independently', () => {
  const s = computeEvalSummary(log([
    entry({ wasGuided: false, userAnnotation: 'positive' }),
    entry({ wasGuided: false, userAnnotation: 'negative' }),
    entry({ wasGuided: false, userAnnotation: 'skipped' }),
    entry({ wasGuided: true, userAnnotation: 'positive' }),
    entry({ wasGuided: true, userAnnotation: 'positive' }),
  ]));
  expect(s.groupA.total).toBe(3);
  expect(s.groupA.annotated).toBe(2);
  expect(s.groupA.satisfactionRate).toBe(0.5);

  expect(s.groupB.total).toBe(2);
  expect(s.groupB.annotated).toBe(2);
  expect(s.groupB.satisfactionRate).toBe(1);
});

// ============================================================
// Cap boundary
// ============================================================

test('computeEvalSummary: handles 200-entry log without error', () => {
  const entries: EvalEntry[] = Array.from({ length: 200 }, (_, i) =>
    entry({ wasGuided: i % 2 === 0, userAnnotation: i % 3 === 0 ? 'positive' : 'skipped', compactionId: `sess:${i}` })
  );
  const s = computeEvalSummary(log(entries));
  expect(s.totalEntries).toBe(200);
  expect(s.groupA.total + s.groupB.total).toBe(200);
});
