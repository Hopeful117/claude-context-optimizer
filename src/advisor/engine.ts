// Advisory engine — composes all rules and returns a deduplicated,
// confidence-sorted result.

import type { MetricsHistory } from '../metrics/types';
import type { AdvisoryResult, Confidence, Recommendation } from './types';
import type { RateLimitSnapshot } from './rules';
import {
  cacheEfficiencyRule,
  contextFillRule,
  contextGrowthRule,
  rateLimitRule,
} from './rules';

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/**
 * Evaluate all heuristics and return a deduplicated, confidence-sorted result.
 * Pure: no engine calls.
 */
export function evaluate(
  history: MetricsHistory,
  rateLimits: readonly RateLimitSnapshot[] = [],
): AdvisoryResult {
  const candidates: (Recommendation | null)[] = [
    contextFillRule(history),
    rateLimitRule(rateLimits),
    contextGrowthRule(history),
    cacheEfficiencyRule(history),
  ];

  const seen = new Set<string>();
  const recommendations: Recommendation[] = [];
  for (const r of candidates) {
    if (r !== null && !seen.has(r.id)) {
      seen.add(r.id);
      recommendations.push(r);
    }
  }

  recommendations.sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);

  return { recommendations };
}
