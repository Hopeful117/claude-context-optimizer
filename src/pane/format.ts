// Pure display formatting helpers for the advisor pane.
// Extracted from hooks/register.tsx for testability.

import type { RecommendationEvidence } from '../advisor/types';

/**
 * One-line evidence summary displayed under a recommendation explanation.
 *
 * Uses `valueUnit` to distinguish absolute percentages from percentage-point deltas:
 * - absent or '%': renders as '85%'
 * - 'pp': renders as '+17 pp' (percentage-point delta)
 */
export function evidenceLine(ev: RecommendationEvidence): string {
  const isPp = ev.valueUnit === 'pp';
  const valStr = isPp
    ? (ev.observedValue >= 0 ? `+${ev.observedValue} pp` : `${ev.observedValue} pp`)
    : `${ev.observedValue}%`;
  let s = `${ev.metric}: ${valStr}`;
  if (ev.threshold !== undefined) {
    const thrStr = isPp ? `${ev.threshold} pp` : `${ev.threshold}%`;
    s += `  · threshold: ${thrStr}`;
  }
  if (ev.sampleCount !== undefined && ev.sampleCount > 1) s += `  · ${ev.sampleCount} turns`;
  return s;
}
