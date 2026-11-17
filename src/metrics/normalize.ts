// Pure normalization functions: raw event data → HistoryEntry.
// No engine calls, no side effects, fully testable in isolation.

import type {
  ContextSource,
  EventKind,
  HistoryEntry,
  NormalizedTurnUsage,
} from './types';

/** Default maximum entries kept per session. */
export const MAX_HISTORY = 100;

type RawContext = {
  tokens?: number;
  window: number;
  percent?: number;
};

type RawModelUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

type RawTurnUsage = RawModelUsage & { model: string };

type MakeEntryParams = {
  kind: EventKind;
  timestampMs: number;
  sessionId: string;
  context: RawContext;
  contextSource: ContextSource;
  costUsd: number | null;
  turnUsage?: RawTurnUsage | null;
  isSubagent?: boolean;
  agentId?: string;
  compactTrigger?: string | null;
  wasGuided?: boolean;
};

export function normalizeContext(context: RawContext): {
  contextWindow: number;
  contextTokens: number | null;
  contextPercent: number | null;
} {
  return {
    contextWindow: context.window,
    contextTokens: context.tokens ?? null,
    contextPercent: context.percent ?? null,
  };
}

export function normalizeTurnUsage(usage: RawTurnUsage | null | undefined): NormalizedTurnUsage | null {
  if (usage == null) return null;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens,
    model: usage.model,
  };
}

export function makeEntry(params: MakeEntryParams): HistoryEntry {
  const ctx = normalizeContext(params.context);
  return {
    kind: params.kind,
    timestampMs: params.timestampMs,
    sessionId: params.sessionId,
    contextSource: params.contextSource,
    contextWindow: ctx.contextWindow,
    contextTokens: ctx.contextTokens,
    contextPercent: ctx.contextPercent,
    turnUsage: normalizeTurnUsage(params.turnUsage),
    costUsd: params.costUsd,
    isSubagent: params.isSubagent ?? false,
    agentId: params.agentId,
    compactTrigger: params.compactTrigger ?? null,
    wasGuided: params.wasGuided,
  };
}
