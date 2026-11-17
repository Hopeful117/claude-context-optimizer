import { expect, test } from 'claude-code/testing';
import { recordTiming, getStats, getAllStats, clearTimings } from './timing';

// Reset state between tests.
function setup() {
  clearTimings();
}

test('getStats: null for unknown key', () => {
  setup();
  expect(getStats('unknown')).toBeNull();
});

test('recordTiming + getStats: single sample', () => {
  setup();
  recordTiming('turn.complete', 2);
  const s = getStats('turn.complete');
  expect(s).not.toBeNull();
  expect(s!.count).toBe(1);
  expect(s!.p50Ms).toBe(2);
  expect(s!.p95Ms).toBe(2);
  expect(s!.maxMs).toBe(2);
});

test('getStats: p50 and p95 on even-sized sample', () => {
  setup();
  // 10 samples: 1..10
  for (let i = 1; i <= 10; i++) recordTiming('h', i);
  const s = getStats('h')!;
  expect(s.count).toBe(10);
  // p50 = sorted[5] = 6, p95 = sorted[9] = 10
  expect(s.p50Ms).toBe(6);
  expect(s.p95Ms).toBe(10);
  expect(s.maxMs).toBe(10);
});

test('getStats: p50 on odd-sized sample', () => {
  setup();
  // 5 samples: 1,3,5,7,9 — sorted same
  for (const v of [9, 1, 5, 3, 7]) recordTiming('h', v);
  const s = getStats('h')!;
  // sorted: [1,3,5,7,9], p50 = sorted[Math.floor(5*0.5)] = sorted[2] = 5
  expect(s.p50Ms).toBe(5);
  expect(s.maxMs).toBe(9);
});

test('recordTiming: caps at MAX_SAMPLES (100), drops oldest', () => {
  setup();
  // Record 110 samples: values 0..109
  for (let i = 0; i < 110; i++) recordTiming('h', i);
  const s = getStats('h')!;
  expect(s.count).toBe(100);
  // Oldest 10 (0..9) dropped; min remaining is 10
  expect(s.maxMs).toBe(109);
  // min is not directly exposed but p50 should be around 59-60
  expect(s.p50Ms).toBeGreaterThanOrEqual(59);
  expect(s.p50Ms).toBeLessThanOrEqual(60);
});

test('getAllStats: returns all recorded keys', () => {
  setup();
  recordTiming('a', 1);
  recordTiming('b', 2);
  recordTiming('c', 3);
  const all = getAllStats();
  expect(Object.keys(all).sort()).toEqual(['a', 'b', 'c']);
});

test('getAllStats: empty object before any recording', () => {
  setup();
  expect(Object.keys(getAllStats()).length).toBe(0);
});

test('clearTimings: resets all keys', () => {
  setup();
  recordTiming('a', 5);
  recordTiming('b', 10);
  clearTimings();
  expect(getStats('a')).toBeNull();
  expect(getStats('b')).toBeNull();
  expect(Object.keys(getAllStats()).length).toBe(0);
});

test('recordTiming: multiple keys are independent', () => {
  setup();
  recordTiming('x', 100);
  recordTiming('y', 1);
  expect(getStats('x')!.p50Ms).toBe(100);
  expect(getStats('y')!.p50Ms).toBe(1);
});

test('recordTiming: zero duration is valid', () => {
  setup();
  recordTiming('h', 0);
  recordTiming('h', 0);
  recordTiming('h', 0);
  const s = getStats('h')!;
  expect(s.p50Ms).toBe(0);
  expect(s.maxMs).toBe(0);
});
