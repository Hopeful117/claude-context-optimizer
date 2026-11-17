import type { Register, SessionContextUsage, SessionRateLimit, SessionCost, UsageUnit } from 'claude-code';

// ES-001 metrics observation spike.
// Captures every field $.session.usage() and session.measure expose.
// Displays observed values; marks absent optional fields as UNAVAILABLE.
// No prompt/code/tool content is stored. No network calls. No model calls.

let turns = 0;
let measurements = 0;

let lastContext: SessionContextUsage | null = null;
let lastRateLimits: SessionRateLimit[] = [];
let lastCost: SessionCost | undefined;
let lastChanged: UsageUnit[] = [];

function statusLine(): string {
  const ctx = lastContext;
  if (!ctx) return `ctx-optimizer: initializing… (${turns}T/${measurements}M)`;

  const pct = ctx.percent !== undefined ? `${ctx.percent}%` : 'pct=N/A';
  const tokens = ctx.tokens !== undefined ? ctx.tokens.toLocaleString() : 'tok=N/A';
  const window = ctx.window.toLocaleString();

  const rl = lastRateLimits.length > 0
    ? lastRateLimits.map(r => `${r.kind}:${r.percentUsed}%`).join(' ')
    : 'rl=N/A';

  const cost = lastCost !== undefined ? `$${lastCost.usd.toFixed(4)}` : 'cost=N/A';

  return `ctx: ${pct} ${tokens}/${window} | ${rl} | ${cost} | ${turns}T/${measurements}M`;
}

export const register: Register = (on) => {
  on('session.start', async ($, event, next) => {
    const sid = await $.session.id();
    const v = await $.session.version();
    const model = await $.session.model();

    $.ui.status(
      `ctx-optimizer loaded | session=${sid.slice(0, 8)} | v=${v.version} | model=${model ?? 'N/A'}`
    );

    // Seed store for cross-turn comparison baseline.
    await $.store.set('ctx.sessionStart', {
      ts: $.clock.now(),
      sessionId: sid,
      version: v.version,
      model: model ?? null,
    });

    return next(event);
  });

  on('session.measure', async ($, event, next) => {
    measurements += 1;
    lastContext = event.context;
    lastRateLimits = event.rateLimits;
    lastCost = event.cost;
    lastChanged = event.changed;

    // Cheap usage call (no breakdown = no token-count API requests).
    const usage = await $.session.usage();

    // Persist metadata snapshot — no prompt/code/secret content.
    await $.store.set('ctx.lastMeasure', {
      ts: $.clock.now(),
      turns,
      measurements,
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
      changed: event.changed,
    });

    $.ui.status(statusLine());
    return next(event);
  });

  on('turn.complete', async ($, event, next) => {
    turns += 1;

    // Refresh figures after each turn — may differ from last session.measure.
    const usage = await $.session.usage();
    lastContext = usage.context;
    lastRateLimits = usage.rateLimits;
    lastCost = usage.cost;

    await $.store.set('ctx.lastTurn', {
      ts: $.clock.now(),
      turns,
      measurements,
      context: {
        tokens: usage.context.tokens ?? null,
        window: usage.context.window,
        percent: usage.context.percent ?? null,
      },
      cost: usage.cost?.usd ?? null,
    });

    $.ui.status(statusLine());
    return next(event);
  });

  on('session.compact', async ($, event, next) => {
    const result = await next(event);

    // Record compaction metadata only — no message content stored.
    await $.store.set('ctx.lastCompact', {
      ts: $.clock.now(),
      trigger: event.trigger,
      agentId: event.agentId ?? null,
    });

    $.ui.status(`ctx-optimizer: compaction (${event.trigger}) observed`);
    return result;
  });
};
