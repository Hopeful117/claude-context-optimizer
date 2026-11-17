import { atom, read, update } from 'claude-code';
import type { Register } from 'claude-code';
import type { MetricsSnapshot } from '../types';

// ES-001 metrics observation spike.
// Pane-based display of context, cache, rate-limit, and cost metrics.
// No prompt/code/tool content collected. No network or model calls.

const PANE = 'context-optimizer';

const metrics = atom(
  { plugin: 'context-optimizer', key: 'metrics' } as const,
  {
    turns: 0,
    measurements: 0,
    sessionId: null,
    model: null,
    context: null,
    apiUsage: null,
    rateLimits: [],
    cost: null,
    lastCompactTrigger: null,
  } satisfies MetricsSnapshot,
  { shape: 'metrics-1' },
);

function na(v: number | null | undefined): string {
  return v !== null && v !== undefined ? v.toLocaleString() : 'N/A';
}

function pct(v: number | null | undefined): string {
  return v !== null && v !== undefined ? `${v}%` : 'N/A';
}

export const register: Register = (on) => {
  on('session.start', async ($, event, next) => {
    const sid = await $.session.id();
    const v = await $.session.version();
    const model = await $.session.model();

    await update($, metrics, m => ({
      ...m,
      sessionId: sid,
      model: model ?? null,
    }));

    void $.ui.open({ id: PANE, title: 'Context Optimizer' });
    $.ui.status(`ctx:ok`);

    return next(event);
  });

  on('session.measure', async ($, event, next) => {
    await update($, metrics, m => ({
      ...m,
      measurements: m.measurements + 1,
      context: {
        tokens: event.context.tokens ?? null,
        window: event.context.window,
        percent: event.context.percent ?? null,
      },
      rateLimits: event.rateLimits.map(r => ({
        kind: r.kind,
        percentUsed: r.percentUsed,
        resetsAt: r.resetsAt ?? null,
      })),
      cost: event.cost?.usd ?? null,
    }));

    const snap = await read($, metrics);
    $.ui.status(`ctx:${pct(snap.context?.percent)}`);
    return next(event);
  });

  on('turn.complete', async ($, event, next) => {
    const usage = await $.session.usage();
    // event.usage carries the turn's actual API token counts directly.
    // Absent on interrupt or API error; preferred over breakdown.apiUsage.
    const apiUsage = event.usage ?? null;

    await update($, metrics, m => ({
      ...m,
      turns: m.turns + 1,
      context: {
        tokens: usage.context.tokens ?? null,
        window: usage.context.window,
        percent: usage.context.percent ?? null,
      },
      rateLimits: usage.rateLimits.map(r => ({
        kind: r.kind,
        percentUsed: r.percentUsed,
        resetsAt: r.resetsAt ?? null,
      })),
      cost: usage.cost?.usd ?? null,
      apiUsage: apiUsage
        ? {
            input_tokens: apiUsage.input_tokens,
            output_tokens: apiUsage.output_tokens,
            cache_read_input_tokens: apiUsage.cache_read_input_tokens,
            cache_creation_input_tokens: apiUsage.cache_creation_input_tokens,
          }
        : null,
    }));

    const snap = await read($, metrics);
    $.ui.status(`ctx:${pct(snap.context?.percent)}`);
    return next(event);
  });

  on('session.compact', async ($, event, next) => {
    const result = await next(event);
    await update($, metrics, m => ({ ...m, lastCompactTrigger: event.trigger }));
    $.ui.status(`ctx:compacted(${event.trigger})`);
    return result;
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, event) => {
    const { Box, Text } = $.ui.resolve(event);
    const snap = await read($, metrics);
    const ctx = snap.context;
    const api = snap.apiUsage;

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>

        {/* Context window */}
        <Box flexDirection="column">
          <Text bold>Context window</Text>
          <Text>  fill:   {pct(ctx?.percent)}  ({na(ctx?.tokens)} / {na(ctx?.window)} tokens)</Text>
        </Box>

        {/* Cache breakdown */}
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

        {/* Rate limits */}
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

        {/* Cost */}
        <Box flexDirection="column">
          <Text bold>Cost</Text>
          <Text>  {snap.cost !== null ? `$${snap.cost.toFixed(4)}` : 'N/A'}</Text>
        </Box>

        {/* Session info */}
        <Box flexDirection="column">
          <Text bold>Session</Text>
          <Text>  id:    {snap.sessionId?.slice(0, 12) ?? 'N/A'}</Text>
          <Text>  model: {snap.model ?? 'N/A'}</Text>
          <Text>  turns: {snap.turns}  measures: {snap.measurements}</Text>
          {snap.lastCompactTrigger && (
            <Text dimColor>  last compact: {snap.lastCompactTrigger}</Text>
          )}
        </Box>

      </Box>
    );
  });
};
