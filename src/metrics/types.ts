// Metric types for the Context Optimizer history layer.
// These are internal types — the PluginState contract lives in types/index.d.ts.

/** Which event produced this history entry. */
export type EventKind = 'session_start' | 'turn' | 'measure' | 'compact';

/** Which API path provided the context snapshot. */
export type ContextSource = 'session.usage' | 'session.measure';

/**
 * Normalized per-turn API usage from event.usage on turn.complete.
 *
 * Values are summed across all model calls in the turn. These are per-turn
 * snapshots — not cumulative across turns and not safe to sum naively.
 *
 * Semantics (from TurnUsage / ModelUsage):
 * - inputTokens: uncached input only (NOT the full context size)
 * - cacheReadTokens: tokens served from prompt cache this turn
 * - cacheWriteTokens: tokens written to prompt cache this turn
 * - outputTokens: tokens generated this turn
 */
export type NormalizedTurnUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
};

/**
 * One observation in the session history.
 *
 * Fields that may be absent are explicitly null so callers never confuse
 * "absent" with "zero". Cumulative fields (costUsd) are marked as such.
 */
export type HistoryEntry = {
  kind: EventKind;
  timestampMs: number;
  sessionId: string;

  // --- Context window snapshot (instantaneous) ---
  // Source of this snapshot: $.session.usage() or the session.measure event.
  contextSource: ContextSource;
  // Model's declared context window in tokens. Always present.
  contextWindow: number;
  // Total input tokens of the last API response (uncached + cache_read + cache_write).
  // Absent until the first API response of the live window; resets after compaction.
  contextTokens: number | null;
  // contextTokens / contextWindow × 100, rounded. Absent same condition.
  contextPercent: number | null;

  // --- Per-turn API usage (only on 'turn' kind) ---
  // Null on aborted/error turns and on non-turn events.
  turnUsage: NormalizedTurnUsage | null;

  // --- Session cost (cumulative) ---
  // Monotonically increasing throughout the session; reset by /clear.
  // Null where the host keeps no cost ledger.
  costUsd: number | null;

  // --- Subagent identification ---
  // isSubagent: true when this turn ran inside a subagent loop.
  // Note: $.session.usage() without agentId always returns the main session's
  // context, even when called from a subagent's turn.complete hook.
  isSubagent: boolean;
  agentId: string | undefined;

  // --- Compaction (only on 'compact' kind) ---
  compactTrigger: string | null;
  // True when guidance was injected for this compaction (ES-011).
  wasGuided?: boolean;
};

/** The bounded in-session history. Stored in the atom, not in $.store. */
export type MetricsHistory = {
  sessionId: string;
  entries: readonly HistoryEntry[];
  compactionCount: number;
  maxEntries: number;
};
