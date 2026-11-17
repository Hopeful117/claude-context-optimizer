import { expect, test } from 'claude-code/testing';
import { makeHistory, appendEntry, recordCompaction, latestEntries, entriesSinceLastCompact } from './history';
import { makeEntry } from './normalize';
import type { HistoryEntry } from './types';

function makeTurnEntry(sessionId: string, ts: number, percent: number | null = null): HistoryEntry {
  return makeEntry({
    kind: 'turn',
    timestampMs: ts,
    sessionId,
    context: { tokens: percent !== null ? percent * 2000 : undefined, window: 200000, percent: percent ?? undefined },
    contextSource: 'session.usage',
    costUsd: null,
  });
}

function makeCompactEntry(sessionId: string, ts: number): HistoryEntry {
  return makeEntry({
    kind: 'compact',
    timestampMs: ts,
    sessionId,
    context: { window: 200000 },
    contextSource: 'session.usage',
    costUsd: null,
    compactTrigger: 'manual',
  });
}

test('makeHistory: starts empty with zero compactions', async () => {
  const h = makeHistory('sess-1');
  expect(h.entries.length).toBe(0);
  expect(h.compactionCount).toBe(0);
  expect(h.sessionId).toBe('sess-1');
});

test('appendEntry: adds entry in chronological order', async () => {
  let h = makeHistory('sess-1');
  h = appendEntry(h, makeTurnEntry('sess-1', 1000, 10));
  h = appendEntry(h, makeTurnEntry('sess-1', 2000, 20));
  expect(h.entries.length).toBe(2);
  expect(h.entries[0].contextPercent).toBe(10);
  expect(h.entries[1].contextPercent).toBe(20);
});

test('appendEntry: drops oldest when at capacity', async () => {
  const MAX = 3;
  let h = makeHistory('sess-1', MAX);
  h = appendEntry(h, makeTurnEntry('sess-1', 1000, 10));
  h = appendEntry(h, makeTurnEntry('sess-1', 2000, 20));
  h = appendEntry(h, makeTurnEntry('sess-1', 3000, 30));
  expect(h.entries.length).toBe(MAX);
  h = appendEntry(h, makeTurnEntry('sess-1', 4000, 40)); // oldest (10%) should drop
  expect(h.entries.length).toBe(MAX);
  expect(h.entries[0].contextPercent).toBe(20); // oldest remaining
  expect(h.entries[MAX - 1].contextPercent).toBe(40); // newest
});

test('appendEntry: does not mutate the original history', async () => {
  const h1 = makeHistory('sess-1');
  const h2 = appendEntry(h1, makeTurnEntry('sess-1', 1000));
  expect(h1.entries.length).toBe(0);
  expect(h2.entries.length).toBe(1);
});

test('recordCompaction: increments count without adding entry', async () => {
  let h = makeHistory('sess-1');
  h = appendEntry(h, makeTurnEntry('sess-1', 1000));
  h = recordCompaction(h);
  expect(h.compactionCount).toBe(1);
  expect(h.entries.length).toBe(1); // entries unchanged
  h = recordCompaction(h);
  expect(h.compactionCount).toBe(2);
});

test('latestEntries: returns N most recent in order', async () => {
  let h = makeHistory('sess-1');
  for (let i = 1; i <= 5; i++) {
    h = appendEntry(h, makeTurnEntry('sess-1', i * 1000, i * 10));
  }
  const latest = latestEntries(h, 3);
  expect(latest.length).toBe(3);
  expect(latest[0].contextPercent).toBe(30);
  expect(latest[2].contextPercent).toBe(50);
});

test('latestEntries: returns all when n >= entries count', async () => {
  let h = makeHistory('sess-1');
  h = appendEntry(h, makeTurnEntry('sess-1', 1000));
  expect(latestEntries(h, 100).length).toBe(1);
});

test('entriesSinceLastCompact: returns all entries when no compaction', async () => {
  let h = makeHistory('sess-1');
  h = appendEntry(h, makeTurnEntry('sess-1', 1000));
  h = appendEntry(h, makeTurnEntry('sess-1', 2000));
  const entries = entriesSinceLastCompact(h);
  expect(entries.length).toBe(2);
});

test('entriesSinceLastCompact: returns only entries after last compact entry', async () => {
  let h = makeHistory('sess-1');
  h = appendEntry(h, makeTurnEntry('sess-1', 1000, 50)); // before compact
  h = appendEntry(h, makeCompactEntry('sess-1', 2000));
  h = appendEntry(h, makeTurnEntry('sess-1', 3000, 5));  // after compact
  h = appendEntry(h, makeTurnEntry('sess-1', 4000, 10)); // after compact
  const entries = entriesSinceLastCompact(h);
  expect(entries.length).toBe(2);
  expect(entries[0].contextPercent).toBe(5);
  expect(entries[1].contextPercent).toBe(10);
});

test('entriesSinceLastCompact: uses the LAST compact when multiple', async () => {
  let h = makeHistory('sess-1');
  h = appendEntry(h, makeTurnEntry('sess-1', 1000, 80));
  h = appendEntry(h, makeCompactEntry('sess-1', 2000));       // first compact
  h = appendEntry(h, makeTurnEntry('sess-1', 3000, 10));
  h = appendEntry(h, makeCompactEntry('sess-1', 4000));       // second compact
  h = appendEntry(h, makeTurnEntry('sess-1', 5000, 15));      // only this one after
  const entries = entriesSinceLastCompact(h);
  expect(entries.length).toBe(1);
  expect(entries[0].contextPercent).toBe(15);
});

test('session isolation: history carries its own sessionId', async () => {
  const h = makeHistory('sess-abc');
  expect(h.sessionId).toBe('sess-abc');
  const entry = makeTurnEntry('sess-abc', 1000);
  expect(entry.sessionId).toBe('sess-abc');
});

test('no double-counting: appendEntry at capacity removes exactly one', async () => {
  const MAX = 5;
  let h = makeHistory('sess-1', MAX);
  for (let i = 0; i < MAX + 10; i++) {
    h = appendEntry(h, makeTurnEntry('sess-1', i * 1000, i));
  }
  expect(h.entries.length).toBe(MAX);
  // Most recent should be at the end
  expect(h.entries[MAX - 1].contextPercent).toBe(14);
  // Oldest retained
  expect(h.entries[0].contextPercent).toBe(10);
});
