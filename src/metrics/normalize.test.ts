import { expect, test } from 'claude-code/testing';
import { normalizeContext, normalizeTurnUsage, makeEntry } from './normalize';

test('normalizeContext: maps present optional fields', async () => {
  const result = normalizeContext({ tokens: 42000, window: 200000, percent: 21 });
  expect(result.contextWindow).toBe(200000);
  expect(result.contextTokens).toBe(42000);
  expect(result.contextPercent).toBe(21);
});

test('normalizeContext: absent optional fields become null', async () => {
  const result = normalizeContext({ window: 200000 });
  expect(result.contextWindow).toBe(200000);
  expect(result.contextTokens).toBeNull();
  expect(result.contextPercent).toBeNull();
});

test('normalizeContext: undefined optional fields become null', async () => {
  const result = normalizeContext({ tokens: undefined, window: 100000, percent: undefined });
  expect(result.contextTokens).toBeNull();
  expect(result.contextPercent).toBeNull();
});

test('normalizeTurnUsage: null input returns null', async () => {
  expect(normalizeTurnUsage(null)).toBeNull();
  expect(normalizeTurnUsage(undefined)).toBeNull();
});

test('normalizeTurnUsage: maps all four token fields and model', async () => {
  const raw = {
    input_tokens: 100,
    output_tokens: 200,
    cache_read_input_tokens: 500,
    cache_creation_input_tokens: 300,
    model: 'claude-sonnet-4-5',
  };
  const result = normalizeTurnUsage(raw);
  expect(result).not.toBeNull();
  expect(result!.inputTokens).toBe(100);
  expect(result!.outputTokens).toBe(200);
  expect(result!.cacheReadTokens).toBe(500);
  expect(result!.cacheWriteTokens).toBe(300);
  expect(result!.model).toBe('claude-sonnet-4-5');
});

test('normalizeTurnUsage: zero values are preserved, not treated as absent', async () => {
  const raw = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    model: 'claude-haiku-4-5',
  };
  const result = normalizeTurnUsage(raw);
  expect(result!.inputTokens).toBe(0);
  expect(result!.cacheReadTokens).toBe(0);
});

test('makeEntry: turn entry with usage', async () => {
  const raw = {
    input_tokens: 50,
    output_tokens: 100,
    cache_read_input_tokens: 20000,
    cache_creation_input_tokens: 5000,
    model: 'claude-sonnet-4-5',
  };
  const entry = makeEntry({
    kind: 'turn',
    timestampMs: 1700000000000,
    sessionId: 'sess-abc',
    context: { tokens: 60000, window: 200000, percent: 30 },
    contextSource: 'session.usage',
    costUsd: 0.0042,
    turnUsage: raw,
    isSubagent: false,
    agentId: undefined,
  });
  expect(entry.kind).toBe('turn');
  expect(entry.sessionId).toBe('sess-abc');
  expect(entry.contextTokens).toBe(60000);
  expect(entry.contextPercent).toBe(30);
  expect(entry.costUsd).toBe(0.0042);
  expect(entry.isSubagent).toBe(false);
  expect(entry.agentId).toBeUndefined();
  expect(entry.turnUsage).not.toBeNull();
  expect(entry.turnUsage!.cacheReadTokens).toBe(20000);
});

test('makeEntry: compact entry has null turnUsage', async () => {
  const entry = makeEntry({
    kind: 'compact',
    timestampMs: 1700000001000,
    sessionId: 'sess-abc',
    context: { window: 200000 }, // tokens/percent absent post-compact
    contextSource: 'session.usage',
    costUsd: 0.012,
    compactTrigger: 'manual',
  });
  expect(entry.kind).toBe('compact');
  expect(entry.contextTokens).toBeNull();
  expect(entry.contextPercent).toBeNull();
  expect(entry.turnUsage).toBeNull();
  expect(entry.compactTrigger).toBe('manual');
});

test('makeEntry: subagent turn is flagged', async () => {
  const entry = makeEntry({
    kind: 'turn',
    timestampMs: 1700000002000,
    sessionId: 'sess-abc',
    context: { tokens: 10000, window: 200000, percent: 5 },
    contextSource: 'session.usage',
    costUsd: null,
    isSubagent: true,
    agentId: 'agent-xyz',
  });
  expect(entry.isSubagent).toBe(true);
  expect(entry.agentId).toBe('agent-xyz');
  expect(entry.turnUsage).toBeNull(); // no usage passed
});

test('makeEntry: measure entry has null turnUsage and no agentId', async () => {
  const entry = makeEntry({
    kind: 'measure',
    timestampMs: 1700000003000,
    sessionId: 'sess-abc',
    context: { tokens: 50000, window: 200000, percent: 25 },
    contextSource: 'session.measure',
    costUsd: 0.005,
  });
  expect(entry.kind).toBe('measure');
  expect(entry.turnUsage).toBeNull();
  expect(entry.isSubagent).toBe(false);
  expect(entry.agentId).toBeUndefined();
});
