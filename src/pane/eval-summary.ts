import type { EvalLog } from '../../types';

export type GroupStats = {
  total: number;
  positive: number;
  negative: number;
  dismissed: number;
  skipped: number;
  annotated: number;
  responseRate: number | null;
  satisfactionRate: number | null;
};

export type EvalSummary = {
  totalEntries: number;
  precomputeExcluded: number;
  groupA: GroupStats;
  groupB: GroupStats;
};

function emptyGroup(): GroupStats {
  return {
    total: 0, positive: 0, negative: 0, dismissed: 0,
    skipped: 0, annotated: 0, responseRate: null, satisfactionRate: null,
  };
}

// Compute aggregate evaluation statistics from evalAtom log.
// precompute entries are excluded from both groups (ADR-004: cannot be guided).
export function computeEvalSummary(log: EvalLog): EvalSummary {
  const totalEntries = log.entries.length;
  const filtered = log.entries.filter(e => e.trigger !== 'precompute');
  const precomputeExcluded = totalEntries - filtered.length;

  const groupA = emptyGroup();
  const groupB = emptyGroup();

  for (const entry of filtered) {
    const g = entry.wasGuided ? groupB : groupA;
    g.total++;
    if (entry.userAnnotation === 'positive') g.positive++;
    else if (entry.userAnnotation === 'negative') g.negative++;
    else if (entry.userAnnotation === 'dismissed') g.dismissed++;
    else g.skipped++;
  }

  for (const g of [groupA, groupB]) {
    g.annotated = g.positive + g.negative + g.dismissed;
    g.responseRate = g.total > 0 ? g.annotated / g.total : null;
    g.satisfactionRate = g.annotated > 0 ? g.positive / g.annotated : null;
  }

  return { totalEntries, precomputeExcluded, groupA, groupB };
}
