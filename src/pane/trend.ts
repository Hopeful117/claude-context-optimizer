// Pure helper: compute a context fill trend display string from history.
// Reuses the same filter as contextGrowthRule — main-session turns only,
// current context window only (after last compaction).

import type { MetricsHistory } from '../metrics/types';
import { entriesSinceLastCompact } from '../metrics/history';
import { CONTEXT_GROWTH_MIN_TURNS } from '../advisor/rules';

/**
 * Returns a short trend string for display in the Session Overview section.
 *
 * Returns 'N/A' when fewer than CONTEXT_GROWTH_MIN_TURNS main-session turns
 * with contextPercent are available in the current context window — the same
 * condition under which contextGrowthRule would not fire.
 *
 * Examples: '↑ +17%  (3 turns)', '↓ -5%  (3 turns)', '→ stable  (3 turns)'
 */
export function contextTrend(history: MetricsHistory): string {
  const sinceLast = entriesSinceLastCompact(history);
  const turns = sinceLast
    .filter(e => e.kind === 'turn' && e.contextPercent !== null && !e.isSubagent)
    .slice(-CONTEXT_GROWTH_MIN_TURNS);

  if (turns.length < CONTEXT_GROWTH_MIN_TURNS) return 'N/A';

  const first = turns[0]!.contextPercent!;
  const last = turns[turns.length - 1]!.contextPercent!;
  const delta = last - first;

  if (delta > 0) return `↑ +${delta}%  (${turns.length} turns)`;
  if (delta < 0) return `↓ ${delta}%  (${turns.length} turns)`;
  return `→ stable  (${turns.length} turns)`;
}
