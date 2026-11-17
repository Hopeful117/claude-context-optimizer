// Bounded in-session metrics history.
// Pure functions only — no engine calls, no side effects.

import type { HistoryEntry, MetricsHistory } from './types';
import { MAX_HISTORY } from './normalize';

/** Create an empty history for a new session. */
export function makeHistory(sessionId: string, maxEntries: number = MAX_HISTORY): MetricsHistory {
  return { sessionId, entries: [], compactionCount: 0, maxEntries };
}

/**
 * Append one entry. When at capacity, the oldest entry is dropped (FIFO).
 * The maxEntries limit applies after the append, so the result always has
 * at most maxEntries entries.
 */
export function appendEntry(history: MetricsHistory, entry: HistoryEntry): MetricsHistory {
  const all = [...history.entries, entry];
  const entries = all.length > history.maxEntries ? all.slice(all.length - history.maxEntries) : all;
  return { ...history, entries };
}

/**
 * Record that a compaction occurred.
 * Does not add a history entry — the caller creates one with kind='compact'.
 */
export function recordCompaction(history: MetricsHistory): MetricsHistory {
  return { ...history, compactionCount: history.compactionCount + 1 };
}

/** Latest N entries, most recent last. Returns a copy. */
export function latestEntries(history: MetricsHistory, n: number): readonly HistoryEntry[] {
  return history.entries.slice(-n);
}

/**
 * Entries in chronological order after the last compaction, or all entries
 * if no compaction occurred. Used to show only the current context window.
 */
export function entriesSinceLastCompact(history: MetricsHistory): readonly HistoryEntry[] {
  let lastCompactIdx = -1;
  for (let i = history.entries.length - 1; i >= 0; i--) {
    const e = history.entries[i];
    if (e !== undefined && e.kind === 'compact') {
      lastCompactIdx = i;
      break;
    }
  }
  return lastCompactIdx >= 0
    ? history.entries.slice(lastCompactIdx + 1)
    : history.entries;
}
