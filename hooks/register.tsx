import { atom, read, update } from 'claude-code';
import type { Register } from 'claude-code';
import type { PaneSnapshot } from '../types';
import type { MetricsHistory } from '../src/metrics/types';
import { composeInstructions } from '../src/guide/instructions';
import { makeEntry, MAX_HISTORY } from '../src/metrics/normalize';
import { makeHistory, appendEntry, recordCompaction } from '../src/metrics/history';
import { evaluate } from '../src/advisor/engine';
import { recordTiming, getAllStats } from '../src/perf/timing';
import { contextTrend } from '../src/pane/trend';
import { evidenceLine } from '../src/pane/format';

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
// Shape bumped to 'pane-2' to clear old state when guideEnabled field is added (ES-010).
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
    guideEnabled: false,
  } satisfies PaneSnapshot,
  { shape: 'pane-2' },
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

// --- Visual theme helpers ---

/** Fill bar: 10-char Unicode block indicator. */
function fillBar(pct: number | null): string {
  if (pct === null) return '──────────';
  const filled = Math.min(10, Math.round(pct / 10));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/** Theme color key based on context fill level. */
function fillColor(pct: number | null): 'success' | 'warning' | 'error' | 'inactive' {
  if (pct === null) return 'inactive';
  if (pct >= 85) return 'error';
  if (pct >= 70) return 'warning';
  return 'success';
}

/** Theme color for the trend arrow. */
function trendColor(trend: string): 'warning' | 'success' | 'subtle' | 'inactive' {
  if (trend.startsWith('↑')) return 'warning';
  if (trend.startsWith('→')) return 'success';
  if (trend.startsWith('↓')) return 'subtle';
  return 'inactive';
}

/** Compact token count: 164000 → '164k'. */
function shortTok(v: number | null): string {
  if (v === null) return 'N/A';
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return v.toString();
}

// --- Event handlers ---

export const register: Register = (on) => {
  on('session.start', async ($, event, next) => {
    // Observability errors must never stall the pipeline — always call next(event).
    const t0 = Date.now();
    try {
      const sid = await $.session.id();
      const model = await $.session.model();
      const now = await $.clock.now();

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
        guideEnabled: false,
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
    } catch {
      // Protect next(event): a status call failure must not stall the pipeline.
      try { $.ui.status('ctx:err'); } catch { /* ignore observability-only failure */ }
    } finally {
      recordTiming('session.start', Date.now() - t0);
    }
    return next(event);
  });

  on('session.measure', async ($, event, next) => {
    const t0 = Date.now();
    try {
      const now = await $.clock.now();
      // Read sessionId before the update to avoid a post-update round-trip.
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
    } catch {
      try { $.ui.status('ctx:err'); } catch { /* ignore observability-only failure */ }
    } finally {
      recordTiming('session.measure', Date.now() - t0);
    }
    return next(event);
  });

  on('turn.complete', async ($, event, next) => {
    const t0 = Date.now();
    try {
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

      const isSubagent = event.agentId !== undefined;

      // Read sessionId before the update — avoids a post-update read.
      const prevSnap = await read($, paneAtom);
      const sessionId = prevSnap.sessionId ?? '';

      await update($, paneAtom, m => ({
        ...m,
        // Only count main-session turns — subagent turns are captured in history
        // but not reflected in the user-facing turn counter.
        turns: isSubagent ? m.turns : m.turns + 1,
        context: contextSnapshot,
        rateLimits,
        costUsd,
        apiUsage,
      }));
      const entry = makeEntry({
        kind: 'turn',
        timestampMs: now,
        sessionId,
        context: usage.context,
        contextSource: 'session.usage',
        costUsd,
        turnUsage: rawUsage ? { ...rawUsage } : null,
        isSubagent,
        agentId: event.agentId,
      });
      await update($, historyAtom, h => appendEntry(h, entry));

      $.ui.status(`ctx:${pct(contextSnapshot.percent)}`);
    } catch {
      try { $.ui.status('ctx:err'); } catch { /* ignore observability-only failure */ }
    } finally {
      recordTiming('turn.complete', Date.now() - t0);
    }
    return next(event);
  });

  on('session.end', async ($, event, next) => {
    // session.start does not fire after /clear (SDK: "never /clear").
    // We must reset here to avoid carrying stale state into the new session.
    // Also handles 'resume' — the mod is reloaded into a fresh context.
    const result = await next(event);
    if (event.reason !== 'clear' && event.reason !== 'resume') return result;

    const t0 = Date.now();
    try {
      const now = await $.clock.now();
      const newSid = await $.session.id();
      const model = await $.session.model();

      await update($, paneAtom, () => ({
        turns: 0,
        measurements: 0,
        compactionCount: 0,
        sessionId: newSid,
        model: model ?? null,
        context: null,
        apiUsage: null,
        rateLimits: [],
        costUsd: null,
        lastCompactTrigger: null,
        guideEnabled: false,
      }));

      const freshHistory = makeHistory(newSid, MAX_HISTORY);
      const startEntry = makeEntry({
        kind: 'session_start',
        timestampMs: now,
        sessionId: newSid,
        context: { window: 0, tokens: undefined, percent: undefined },
        contextSource: 'session.usage',
        costUsd: null,
      });
      await update($, historyAtom, () => appendEntry(freshHistory, startEntry));

      // /clear closes all panes — reopen.
      void $.ui.open({ id: PANE, title: 'Context Optimizer' });
      $.ui.status('ctx:ok');
    } catch {
      $.ui.status('ctx:err');
    } finally {
      recordTiming('session.end', Date.now() - t0);
    }
    return result;
  });

  on('session.compact', async ($, event, next) => {
    // --- ES-010: Guidance injection (prototype) ---
    // Intercept manual and plugin triggers only. Default: disabled (guideEnabled=false).
    // Fail-open: any error falls back to passing the original event unchanged.
    let guideEnabled = false;
    try {
      const preSnap = await read($, paneAtom);
      guideEnabled = preSnap.guideEnabled;
    } catch { /* ignore; guideEnabled stays false */ }

    let eventToPass = event;
    if (guideEnabled && (event.trigger === 'manual' || event.trigger === 'plugin')) {
      try {
        eventToPass = { ...event, instructions: composeInstructions(event.instructions) };
      } catch { /* fail-open: use original event */ }
    }

    // Delegate to SDK (with potentially augmented instructions).
    const result = await next(eventToPass);

    // --- Post-compaction state update (unchanged from v0.8.0) ---
    const t0 = Date.now();
    try {
      const now = await $.clock.now();
      const snap = await read($, paneAtom);

      await update($, paneAtom, m => ({
        ...m,
        compactionCount: m.compactionCount + 1,
        lastCompactTrigger: event.trigger,
        // Null out stale per-window data: tokens/percent and last-turn API usage
        // are now obsolete. context.window is preserved (model unchanged).
        // costUsd, rateLimits, turns, measurements are still valid.
        context: m.context !== null
          ? { window: m.context.window, tokens: null, percent: null }
          : null,
        apiUsage: null,
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

      const wasGuided = guideEnabled && (event.trigger === 'manual' || event.trigger === 'plugin');
      $.ui.status(`ctx:${wasGuided ? 'guided-' : ''}compacted(${event.trigger})`);
    } catch {
      $.ui.status('ctx:err');
    } finally {
      recordTiming('session.compact', Date.now() - t0);
    }
    return result;
  });

  // --- Pane rendering ---

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, event) => {
    const t0 = Date.now();
    // Resolve components first — needed in both success and error paths.
    const { Box, Text, Button } = $.ui.resolve(event);
    try {
      const snap = await read($, paneAtom);
      const history = await read($, historyAtom);
      const ctx = snap.context;
      const api = snap.apiUsage;
      const advisory = evaluate(history, snap.rateLimits);
      const perf = getAllStats();
      const perfKeys = Object.keys(perf);

      const fillPct = ctx?.percent ?? null;
      const trend = contextTrend(history);
      const warnings = advisory.recommendations.filter(r => r.category === 'warning').length;
      const observations = advisory.recommendations.length - warnings;

      // ES-010: toggle handler — fires-and-forgets the atom update (onPress is void).
      const toggleGuide = () => {
        void update($, paneAtom, m => ({ ...m, guideEnabled: !m.guideEnabled }));
      };

      return (
        <Box flexDirection="column" gap={1} paddingX={1}>

          {/* Branded header */}
          <Box flexDirection="column">
            <Text><Text color='claude'>◆</Text>  Context Optimizer</Text>
            <Text dimColor>{'─'.repeat(24)}</Text>
          </Box>

          {/* Level 1 — Session Overview */}
          <Box flexDirection="column">
            <Text bold>Session Overview</Text>
            <Text>
              {'  '}
              <Text color={fillColor(fillPct)}>{fillBar(fillPct)}  {pct(fillPct)}</Text>
              <Text dimColor>  ({shortTok(ctx?.tokens ?? null)}/{shortTok(ctx?.window ?? null)} tok)</Text>
            </Text>
            <Text>  trend:  <Text color={trendColor(trend)}>{trend}</Text></Text>
            <Text>
              {'  state:  '}
              {advisory.recommendations.length === 0 ? (
                <Text color='success'>no active recommendations</Text>
              ) : (
                <>
                  {warnings > 0 && <Text color='warning'>⚠ {warnings} warning{warnings > 1 ? 's' : ''}</Text>}
                  {warnings > 0 && observations > 0 && <Text>{'  '}</Text>}
                  {observations > 0 && <Text color='claude'>ℹ {observations} observation{observations > 1 ? 's' : ''}</Text>}
                </>
              )}
            </Text>
          </Box>

          {/* Level 2 — Advisor Insights */}
          <Box flexDirection="column">
            <Text bold>Advisor</Text>
            {advisory.recommendations.length > 0 ? (
              advisory.recommendations.map(r => {
                const iconColor = r.category === 'warning' ? 'warning' : r.category === 'action' ? 'success' : 'claude';
                const icon = r.category === 'warning' ? '⚠' : r.category === 'action' ? '→' : 'ℹ';
                const confTag = r.confidence !== 'high' ? ` [${r.confidence[0]?.toUpperCase()}]` : '';
                const ev = r.evidence?.[0];
                const evText = ev !== undefined ? evidenceLine(ev) : null;
                return (
                  <Box flexDirection="column">
                    <Text>{'  '}<Text color={iconColor}>{icon}</Text>{confTag} {r.label}</Text>
                    <Text dimColor>      {r.explanation}</Text>
                    {evText !== null && (
                      <Text dimColor>      {evText}</Text>
                    )}
                  </Box>
                );
              })
            ) : (
              <Text dimColor>  No active recommendations — thresholds not reached.</Text>
            )}
          </Box>

          {/* Level 3 — Diagnostics */}
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
                <Text>  {r.kind}: <Text color={r.percentUsed >= 90 ? 'warning' : r.percentUsed >= 75 ? 'claude' : undefined}>{r.percentUsed}%</Text>{r.resetsAt ? ` (resets ${r.resetsAt.slice(0, 10)})` : ''}</Text>
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

          {/* ES-010: Compaction Guidance prototype toggle */}
          <Box flexDirection="column">
            <Text bold>Compaction Guidance <Text dimColor>(prototype)</Text></Text>
            <Box flexDirection="row">
              <Button
                onPress={toggleGuide}
                variant={snap.guideEnabled ? 'primary' : undefined}
              >
                {snap.guideEnabled ? '● Active' : '○ Disabled'}
              </Button>
              <Text dimColor>
                {'  '}{snap.guideEnabled
                  ? 'Augments /compact with preservation hints'
                  : 'Enable to guide /compact summaries'}
              </Text>
            </Box>
          </Box>

          {perfKeys.length > 0 && (
            <Box flexDirection="column">
              <Text bold>Overhead (p50 / p95 ms)</Text>
              {perfKeys.map(key => {
                const s = perf[key]!;
                return (
                  <Text dimColor>  {key}: {s.p50Ms.toFixed(1)} / {s.p95Ms.toFixed(1)} (n={s.count})</Text>
                );
              })}
            </Box>
          )}

        </Box>
      );
    } catch {
      return <Box><Text dimColor>Context Optimizer — render error</Text></Box>;
    } finally {
      recordTiming('ui.render', Date.now() - t0);
    }
  });
};
