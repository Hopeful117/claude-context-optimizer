// PluginState contract — must be self-contained (no imports).
// Types are inlined from src/metrics/types.ts.

export type EventKind = 'session_start' | 'turn' | 'measure' | 'compact';
export type ContextSource = 'session.usage' | 'session.measure';

// ES-014: evaluation data types.
export type UserAnnotation = 'positive' | 'negative' | 'skipped';

export type EvalEntry = {
  compactionId: string;
  wasGuided: boolean;
  trigger: string;
  timestampMs: number;
  turnsAtCompaction: number;
  turnsToResumption: number | null;
  userAnnotation: UserAnnotation;
};

export type EvalLog = {
  entries: EvalEntry[];
  maxEntries: number;
};

export type NormalizedTurnUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
};

export type HistoryEntry = {
  kind: EventKind;
  timestampMs: number;
  sessionId: string;
  contextSource: ContextSource;
  contextWindow: number;
  contextTokens: number | null;
  contextPercent: number | null;
  turnUsage: NormalizedTurnUsage | null;
  costUsd: number | null;
  isSubagent: boolean;
  agentId: string | undefined;
  compactTrigger: string | null;
  wasGuided?: boolean;
  // ES-014: evaluation signals (compact-kind only).
  turnsBeforeCompaction?: number;
  contextPercentAtCompaction?: number | null;
};

export type MetricsHistory = {
  sessionId: string;
  entries: readonly HistoryEntry[];
  compactionCount: number;
  maxEntries: number;
};

export type PaneSnapshot = {
  turns: number;
  measurements: number;
  compactionCount: number;
  sessionId: string | null;
  model: string | null;
  context: {
    tokens: number | null;
    window: number;
    percent: number | null;
  } | null;
  apiUsage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  } | null;
  rateLimits: Array<{
    kind: string;
    percentUsed: number;
    resetsAt: string | null;
  }>;
  costUsd: number | null;
  lastCompactTrigger: string | null;
  /** ES-010: whether compaction guidance is active for this session. Default: false. */
  guideEnabled: boolean;
  /** ES-011: whether guidance is active for engine-initiated (auto) compactions. Default: false. */
  autoGuideEnabled: boolean;
  /** ES-012: whether the guidance toggle preference is persisted across sessions. Default: false. */
  rememberPrefs: boolean;
  /** ES-014: compactionId of the most recent compaction awaiting annotation. Null when none pending. */
  pendingAnnotationId: string | null;
  /** ES-014: main-session turns elapsed since the last compaction (while annotation is pending). */
  turnsSinceCompaction: number;
};

declare module 'claude-code' {
  interface PluginState {
    'context-optimizer': {
      history: Shaped<MetricsHistory>;
      pane: Shaped<PaneSnapshot>;
      // Migration shim: allows the engine to safely clear v0.2.0 'metrics' state.
      // Remove once all sessions have been restarted past v0.3.0.
      metrics: Shaped<null>;
      // ES-012: persistent user guidance preference (rememberPrefs + guideEnabled).
      prefs: Shaped<{ rememberPrefs: boolean; guideEnabled: boolean }>;
      // ES-014: bounded evaluation log (turnsToResumption + user annotation per compaction).
      eval: Shaped<EvalLog>;
    };
  }
}
