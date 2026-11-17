import { atom, read, update } from 'claude-code';
import type { Register } from 'claude-code';
import type { PaneSnapshot } from '../types';
import type { MetricsHistory } from '../src/metrics/types';
import { makeEntry, MAX_HISTORY } from '../src/metrics/normalize';
import { makeHistory, appendEntry, recordCompaction } from '../src/metrics/history';

const PANE = 'context-optimizer';

// --- Reactive atoms ---

// Migration shim: v0.2.0 stored state under key 'metrics' (shape 'metrics-1').
// Declaring the atom here lets the engine safely access and discard old state.
// The shape 'compat-clear-1' doesn't match 'metrics-1', so old state is dropped.
// This atom is never read or written by hooks. Remove after all sessions restart.
const _legacyMetricsCompat = atom(
  { plugin: 'context-optimizer', key: 'metrics' } as const,
  null as null,
  { shape: 'compat-clear-1' },
);
void _legacyMetricsCompat; // silence unused-variable warnings

// Current display state — drives the pane, updated on every event.
const paneAtom = atom(
  { plugin: 'context-optimizer', key: 'pane' } as const,
  {
    turns: 0,
    measurements: 0,
    compactionCount: 0,
    sessionId: null,
    model: null,
    context: null,
    apiUsage: null,
    rateLimits: [],
    costUsd: null,
    lastCompactTrigger: null,
  } satisfies PaneSnapshot,
  { shape: 'pane-1' },
);

// Bounded history — updated on every event, capped at MAX_HISTORY entries.
// Not rendered directly; available for future analysis hooks.
const historyAtom = atom(
  { plugin: 'context-optimizer', key: 'history' } as const,
  makeHistory('', MAX_HISTORY) satisfies MetricsHistory,
  { shape: 'history-1' },
);

// --- Helpers ---

function pct(v: number | null | undefined): string {
  return v !== null && v !== undefined ? `${v}%` : 'N/A';
}

function na(v: number | null | undefined): string {
  return v !== null && v !== undefined ? v.toLocaleString() : 'N/A';
}

// --- Event handlers ---

export const register: Register = (on) => {
  on('session.start', async ($, event, next) => {
    const sid = await $.session.id();
    const model = await $.session.model();
    const now = await $.clock.now();

    // Reset both atoms for the new session.
    await update($, paneAtom, () => ({
      turns: 0,
      measurements: 0,
      compactionCount: 0,
      sessionId: sid,
      model: model ?? null,
      context: null,
      apiUsage: null,
      rateLimits: [],
      costUsd: null,
      lastCompactTrigger: null,
    }));

    const freshHistory = makeHistory(sid, MAX_HISTORY);
    const startEntry = makeEntry({
      kind: 'session_start',
      timestampMs: now,
      sessionId: sid,
      context: { window: 0, tokens: undefined, percent: undefined },
      contextSource: 'session.usage',
      costUsd: null,
    });
    await update($, historyAtom, () => appendEntry(freshHistory, startEntry));

    void $.ui.open({ id: PANE, title: 'Context Optimizer' });
    $.ui.status('ctx:ok');
    return next(event);
  });

  on('session.measure', async ($, event, next) => {
    const now = await $.clock.now();
    const snap = await read($, paneAtom);
    const sid = snap.sessionId ?? '';

    const contextSnapshot = {
      tokens: event.context.tokens ?? null,
      window: event.context.window,
      percent: event.context.percent ?? null,
    };
    const costUsd = event.cost?.usd ?? null;
    const rateLimits = event.rateLimits.map(r => ({
      kind: r.kind,
      percentUsed: r.percentUsed,
      resetsAt: r.resetsAt ?? null,
    }));

    await update($, paneAtom, m => ({
      ...m,
      measurements: m.measurements + 1,
      context: contextSnapshot,
      rateLimits,
      costUsd,
    }));

    const entry = makeEntry({
      kind: 'measure',
      timestampMs: now,
      sessionId: sid,
      context: event.context,
      contextSource: 'session.measure',
      costUsd,
    });
    await update($, historyAtom, h => appendEntry(h, entry));

    $.ui.status(`ctx:${pct(contextSnapshot.percent)}`);
    return next(event);
  });

  on('turn.complete', async ($, event, next) => {
    const now = await $.clock.now();
    const usage = await $.session.usage();
    // event.usage carries the turn's actual API token counts (sum of all model
    // calls in the turn). Absent on aborted/error turns.
    const rawUsage = event.usage ?? null;

    const contextSnapshot = {
      tokens: usage.context.tokens ?? null,
      window: usage.context.window,
      percent: usage.context.percent ?? null,
    };
    const costUsd = usage.cost?.usd ?? null;
    const rateLimits = usage.rateLimits.map(r => ({
      kind: r.kind,
      percentUsed: r.percentUsed,
      resetsAt: r.resetsAt ?? null,
    }));

    const apiUsage = rawUsage ? {
      input_tokens: rawUsage.input_tokens,
      output_tokens: rawUsage.output_tokens,
      cache_read_input_tokens: rawUsage.cache_read_input_tokens,
      cache_creation_input_tokens: rawUsage.cache_creation_input_tokens,
    } : null;

    await update($, paneAtom, m => ({
      ...m,
      turns: m.turns + 1,
      context: contextSnapshot,
      rateLimits,
      costUsd,
      apiUsage,
    }));

    const snap = await read($, paneAtom);
    const isSubagent = event.agentId !== undefined;
    const entry = makeEntry({
      kind: 'turn',
      timestampMs: now,
      sessionId: snap.sessionId ?? '',
      context: usage.context,
      contextSource: 'session.usage',
      costUsd,
      turnUsage: rawUsage ? { ...rawUsage } : null,
      isSubagent,
      agentId: event.agentId,
    });
    await update($, historyAtom, h => appendEntry(h, entry));

    $.ui.status(`ctx:${pct(contextSnapshot.percent)}`);
    return next(event);
  });

  on('session.compact', async ($, event, next) => {
    const result = await next(event);
    const now = await $.clock.now();
    const snap = await read($, paneAtom);

    await update($, paneAtom, m => ({
      ...m,
      compactionCount: m.compactionCount + 1,
      lastCompactTrigger: event.trigger,
    }));

    const entry = makeEntry({
      kind: 'compact',
      timestampMs: now,
      sessionId: snap.sessionId ?? '',
      // After compaction, context tokens/percent are absent until next response.
      context: { window: snap.context?.window ?? 0, tokens: undefined, percent: undefined },
      contextSource: 'session.usage',
      costUsd: snap.costUsd,
      compactTrigger: event.trigger,
    });
    await update($, historyAtom, h => appendEntry(recordCompaction(h), entry));

    $.ui.status(`ctx:compacted(${event.trigger})`);
    return result;
  });

  // --- Pane rendering ---

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, event) => {
    const { Box, Text } = $.ui.resolve(event);
    const snap = await read($, paneAtom);
    const history = await read($, historyAtom);
    const ctx = snap.context;
    const api = snap.apiUsage;

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>

        <Box flexDirection="column">
          <Text bold>Context window</Text>
          <Text>  fill:   {pct(ctx?.percent)}  ({na(ctx?.tokens)} / {na(ctx?.window)} tokens)</Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Cache (last turn)</Text>
          {api ? (
            <>
              <Text>  cache read:  {na(api.cache_read_input_tokens)}</Text>
              <Text>  cache write: {na(api.cache_creation_input_tokens)}</Text>
              <Text>  uncached in: {na(api.input_tokens)}</Text>
              <Text>  output:      {na(api.output_tokens)}</Text>
            </>
          ) : (
            <Text dimColor>  N/A — awaiting first turn with breakdown</Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text bold>Rate limits</Text>
          {snap.rateLimits.length > 0 ? (
            snap.rateLimits.map(r => (
              <Text>  {r.kind}: {r.percentUsed}%{r.resetsAt ? ` (resets ${r.resetsAt.slice(0, 10)})` : ''}</Text>
            ))
          ) : (
            <Text dimColor>  N/A — no rate limit data</Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text bold>Cost</Text>
          <Text>  {snap.costUsd !== null ? `$${snap.costUsd.toFixed(4)}` : 'N/A'}</Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Session</Text>
          <Text>  id:    {snap.sessionId?.slice(0, 12) ?? 'N/A'}</Text>
          <Text>  model: {snap.model ?? 'N/A'}</Text>
          <Text>  turns: {snap.turns}  measures: {snap.measurements}</Text>
          {snap.compactionCount > 0 && (
            <Text dimColor>  compactions: {snap.compactionCount}{snap.lastCompactTrigger ? ` (last: ${snap.lastCompactTrigger})` : ''}</Text>
          )}
          <Text dimColor>  history: {history.entries.length}/{history.maxEntries} entries</Text>
        </Box>

      </Box>
    );
  });
};
