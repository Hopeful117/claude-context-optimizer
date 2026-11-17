// Deterministic heuristic rules — pure functions, no engine calls.
// Each rule takes `MetricsHistory` (and optionally rate-limit snapshots)
// and returns a `Recommendation` or `null` when the condition is not met.

import type { MetricsHistory } from '../metrics/types';
import type { Recommendation } from './types';
import { entriesSinceLastCompact, latestEntries } from '../metrics/history';

export type RateLimitSnapshot = {
  kind: string;
  percentUsed: number;
};

// Thresholds — intentionally kept as named constants for testability.
export const CONTEXT_FILL_HIGH = 85;
export const CONTEXT_FILL_MEDIUM = 70;
export const CACHE_EFFICIENCY_MIN_TURNS = 3;
export const CACHE_EFFICIENCY_LOW_RATIO = 0.30;
export const RATE_LIMIT_HIGH = 90;
export const RATE_LIMIT_MEDIUM = 75;
export const CONTEXT_GROWTH_MIN_TURNS = 3;
export const CONTEXT_GROWTH_RAPID_DELTA = 15;

/**
 * Warn when the context window fill crosses 70% (medium) or 85% (high).
 * Uses the most recent entry that has a non-null contextPercent.
 */
export function contextFillRule(history: MetricsHistory): Recommendation | null {
  // Walk from newest to find the latest entry with a percent reading.
  const entries = history.entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e === undefined || e.contextPercent === null) continue;
    const pct = e.contextPercent;
    if (pct >= CONTEXT_FILL_HIGH) {
      return {
        id: 'context-fill-high',
        label: 'Context nearly full',
        explanation: `Context is at ${pct}% — consider /compact soon to avoid an automatic compaction.`,
        confidence: 'high',
      };
    }
    if (pct >= CONTEXT_FILL_MEDIUM) {
      return {
        id: 'context-fill-medium',
        label: 'Context fill is high',
        explanation: `Context is at ${pct}% — plan for /compact before it becomes critical.`,
        confidence: 'medium',
      };
    }
    return null; // pct < threshold
  }
  return null; // no entry with a percent reading
}

/**
 * Flag low cache-read efficiency after at least CACHE_EFFICIENCY_MIN_TURNS turns.
 * Cache read ratio = cacheReadTokens / (inputTokens + cacheReadTokens + cacheWriteTokens).
 * A low ratio means Claude is re-reading mostly uncached content, which costs more.
 */
export function cacheEfficiencyRule(history: MetricsHistory): Recommendation | null {
  const recent = latestEntries(history, CACHE_EFFICIENCY_MIN_TURNS * 2);
  const turns = recent.filter(e => e.kind === 'turn' && e.turnUsage !== null && !e.isSubagent);
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
      label: 'Low cache hit rate',
      explanation: `Only ${pct}% of recent input tokens came from cache — large prompt edits between turns may hurt efficiency.`,
      confidence: 'medium',
    };
  }
  return null;
}

/**
 * Warn when any rate limit is close to exhaustion.
 * Accepts the current rate-limit snapshots from PaneSnapshot.rateLimits.
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
      label: 'Rate limit nearly exhausted',
      explanation: `${highest.kind} rate limit is at ${highest.percentUsed}% — slow down or wait for the reset.`,
      confidence: 'high',
    };
  }
  if (highest.percentUsed >= RATE_LIMIT_MEDIUM) {
    return {
      id: 'rate-limit-medium',
      label: 'Rate limit above 75%',
      explanation: `${highest.kind} rate limit is at ${highest.percentUsed}% — monitor usage to avoid hitting the limit.`,
      confidence: 'medium',
    };
  }
  return null;
}

/**
 * Detect rapid context growth: if context percent increased by more than
 * CONTEXT_GROWTH_RAPID_DELTA points across the last CONTEXT_GROWTH_MIN_TURNS turns.
 */
export function contextGrowthRule(history: MetricsHistory): Recommendation | null {
  const recent = entriesSinceLastCompact(history);
  // Need at least min_turns entries with percent readings.
  const withPct = recent
    .filter(e => e.contextPercent !== null && (e.kind === 'turn' || e.kind === 'measure'))
    .slice(-CONTEXT_GROWTH_MIN_TURNS);

  if (withPct.length < CONTEXT_GROWTH_MIN_TURNS) return null;

  const first = withPct[0];
  const last = withPct[withPct.length - 1];
  if (first === undefined || last === undefined) return null;
  if (first.contextPercent === null || last.contextPercent === null) return null;

  const delta = last.contextPercent - first.contextPercent;
  if (delta >= CONTEXT_GROWTH_RAPID_DELTA) {
    return {
      id: 'context-growth-rapid',
      label: 'Rapid context growth',
      explanation: `Context grew ${delta}% over the last ${CONTEXT_GROWTH_MIN_TURNS} turns — at this rate /compact will be needed soon.`,
      confidence: 'medium',
    };
  }
  return null;
}
