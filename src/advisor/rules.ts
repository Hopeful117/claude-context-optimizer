// Deterministic heuristic rules — pure functions, no engine calls.
// Each rule takes `MetricsHistory` (and optionally rate-limit snapshots)
// and returns a `Recommendation` or `null` when the condition is not met.

import type { MetricsHistory } from '../metrics/types';
import type { Recommendation } from './types';
import { entriesSinceLastCompact } from '../metrics/history';

export type RateLimitSnapshot = {
  kind: string;
  percentUsed: number;
};

// Thresholds — intentionally kept as named constants for testability.
// These are initial hypotheses, not empirically validated values.
export const CONTEXT_FILL_HIGH = 85;
export const CONTEXT_FILL_MEDIUM = 70;
export const CACHE_EFFICIENCY_MIN_TURNS = 3;
export const CACHE_EFFICIENCY_LOW_RATIO = 0.30;
export const RATE_LIMIT_HIGH = 90;
export const RATE_LIMIT_MEDIUM = 75;
export const CONTEXT_GROWTH_MIN_TURNS = 3;
export const CONTEXT_GROWTH_RAPID_DELTA = 15;

/**
 * Inform when the context window fill crosses 70% (medium) or 85% (high).
 *
 * Uses only entries from the current context window (after last compaction).
 * After compaction, returns null until a new measurement is available —
 * pre-compaction fill values must not be carried over to the new context.
 *
 * Data needed: at least one entry with a non-null contextPercent in the
 * current context window.
 *
 * False positives: a session that intentionally runs at high fill without
 * needing compaction (e.g. large CLAUDE.md, many tool results).
 */
export function contextFillRule(history: MetricsHistory): Recommendation | null {
  // Only look at entries in the current context window (after last compaction).
  const entries = entriesSinceLastCompact(history);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e === undefined || e.contextPercent === null) continue;
    const pct = e.contextPercent;
    if (pct >= CONTEXT_FILL_HIGH) {
      return {
        id: 'context-fill-high',
        category: 'warning',
        label: 'Context nearly full',
        explanation: `Context is at ${pct}% — the window is filling up. If the task continues much longer, a manual /compact or a fresh session may be worth considering.`,
        confidence: 'high',
      };
    }
    if (pct >= CONTEXT_FILL_MEDIUM) {
      return {
        id: 'context-fill-medium',
        category: 'observation',
        label: 'Context fill is elevated',
        explanation: `Context is at ${pct}% — the window is over ${CONTEXT_FILL_MEDIUM}% full. Worth keeping in mind if the task has a long way to go.`,
        confidence: 'medium',
      };
    }
    return null; // pct < threshold
  }
  return null; // no entry with a percent reading in the current window
}

/**
 * Flag low cache-read efficiency after at least CACHE_EFFICIENCY_MIN_TURNS
 * main-session turns in the current context window.
 *
 * Cache read ratio = cacheReadTokens / (inputTokens + cacheReadTokens + cacheWriteTokens).
 *
 * A low ratio can be normal: session start, post-compaction warmup, large task
 * switch, or multi-agent activity. This rule requires enough turns in the
 * current window before drawing conclusions, and downgrades the finding to
 * an observation with low confidence.
 *
 * Data needed: ≥ CACHE_EFFICIENCY_MIN_TURNS non-subagent turns with usage
 * in the current context window.
 *
 * False positives: any session that is legitimately writing new context
 * (early turns, fresh task, recently compacted).
 *
 * Limits: the ratio reflects token counts, not prompt cache effectiveness
 * in isolation. Users have limited direct control over cache hit rate.
 */
export function cacheEfficiencyRule(history: MetricsHistory): Recommendation | null {
  const sinceLast = entriesSinceLastCompact(history);
  const turns = sinceLast.filter(e => e.kind === 'turn' && e.turnUsage !== null && !e.isSubagent);
  if (turns.length < CACHE_EFFICIENCY_MIN_TURNS) return null;

  let totalCacheRead = 0;
  let totalInput = 0;
  for (const e of turns) {
    const u = e.turnUsage!;
    totalCacheRead += u.cacheReadTokens;
    totalInput += u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
  }
  if (totalInput === 0) return null;

  const ratio = totalCacheRead / totalInput;
  if (ratio < CACHE_EFFICIENCY_LOW_RATIO) {
    const pct = Math.round(ratio * 100);
    return {
      id: 'cache-efficiency-low',
      category: 'observation',
      label: 'Low cache read ratio',
      explanation: `${pct}% of recent input tokens came from cache across ${turns.length} turns. This may be normal for a new task or after a large context change. If it persists long-term, a stable CLAUDE.md helps cache efficiency.`,
      confidence: 'low',
    };
  }
  return null;
}

/**
 * Warn when any rate limit is close to exhaustion.
 * Accepts the current rate-limit snapshots from PaneSnapshot.rateLimits.
 *
 * Data needed: at least one rate limit snapshot with percentUsed >= threshold.
 *
 * False positives: none expected — rate limit data is authoritative from the API.
 */
export function rateLimitRule(rateLimits: readonly RateLimitSnapshot[]): Recommendation | null {
  let highest: RateLimitSnapshot | null = null;
  for (const r of rateLimits) {
    if (highest === null || r.percentUsed > highest.percentUsed) {
      highest = r;
    }
  }
  if (highest === null) return null;

  if (highest.percentUsed >= RATE_LIMIT_HIGH) {
    return {
      id: 'rate-limit-high',
      category: 'warning',
      label: 'Rate limit nearly exhausted',
      explanation: `${highest.kind} rate limit is at ${highest.percentUsed}% — slow down or wait for the reset.`,
      confidence: 'high',
    };
  }
  if (highest.percentUsed >= RATE_LIMIT_MEDIUM) {
    return {
      id: 'rate-limit-medium',
      category: 'observation',
      label: 'Rate limit above 75%',
      explanation: `${highest.kind} rate limit is at ${highest.percentUsed}% — monitor usage to avoid hitting the limit.`,
      confidence: 'medium',
    };
  }
  return null;
}

/**
 * Detect rapid context growth across the last CONTEXT_GROWTH_MIN_TURNS
 * main-session turns in the current context window.
 *
 * Only 'turn' entries from the main session are considered.
 * 'measure' events (session.measure) can occur multiple times per turn and
 * must not be counted as separate turns.
 * Subagent turns are excluded: $.session.usage() always returns the main
 * session context even from a subagent hook, making those readings duplicates.
 *
 * Data needed: ≥ CONTEXT_GROWTH_MIN_TURNS main-session turns with
 * contextPercent in the current context window.
 *
 * False positives: a session intentionally loading large context at start.
 *
 * Limits: thresholds are initial hypotheses, not empirically validated.
 */
export function contextGrowthRule(history: MetricsHistory): Recommendation | null {
  const sinceLast = entriesSinceLastCompact(history);
  // Only main-session turn entries — not 'measure', not subagent turns.
  const turns = sinceLast
    .filter(e => e.kind === 'turn' && e.contextPercent !== null && !e.isSubagent)
    .slice(-CONTEXT_GROWTH_MIN_TURNS);

  if (turns.length < CONTEXT_GROWTH_MIN_TURNS) return null;

  const first = turns[0];
  const last = turns[turns.length - 1];
  if (first === undefined || last === undefined) return null;
  if (first.contextPercent === null || last.contextPercent === null) return null;

  const delta = last.contextPercent - first.contextPercent;
  if (delta >= CONTEXT_GROWTH_RAPID_DELTA) {
    return {
      id: 'context-growth-rapid',
      category: 'warning',
      label: 'Rapid context growth',
      explanation: `Context grew ${delta}% across the last ${CONTEXT_GROWTH_MIN_TURNS} main-session turns — at this rate the window could fill quickly.`,
      confidence: 'medium',
    };
  }
  return null;
}
