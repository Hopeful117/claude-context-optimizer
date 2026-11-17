export type MetricsSnapshot = {
  turns: number;
  measurements: number;
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
  cost: number | null;
  lastCompactTrigger: string | null;
};

declare module 'claude-code' {
  interface PluginState {
    'context-optimizer': {
      metrics: Shaped<MetricsSnapshot>;
    };
  }
}
