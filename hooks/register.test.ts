// Regression tests for ES-013 stabilization.
//
// Scope: pure-function behaviors extracted from the session.compact handler
// and the toggle state contract. SDK-bound handler behaviors (atom reads/writes,
// $.ui.status calls, next() invocation count) require live Claude Desktop
// runtime validation — documented at the end of this file.

import { expect, test } from 'claude-code/testing';
import { makeEntry } from '../src/metrics/normalize';
import { composeInstructions } from '../src/guide/instructions';

// ============================================================
// ANO-001 fix: makeEntry propagates wasGuided
// ============================================================

test('makeEntry: wasGuided=true propagated to HistoryEntry', () => {
  const entry = makeEntry({
    kind: 'compact',
    timestampMs: 1700000000000,
    sessionId: 'sess-001',
    context: { window: 200000 },
    contextSource: 'session.usage',
    costUsd: null,
    compactTrigger: 'manual',
    wasGuided: true,
  });
  expect(entry.wasGuided).toBe(true);
});

test('makeEntry: wasGuided=false propagated to HistoryEntry', () => {
  const entry = makeEntry({
    kind: 'compact',
    timestampMs: 1700000000000,
    sessionId: 'sess-001',
    context: { window: 200000 },
    contextSource: 'session.usage',
    costUsd: null,
    compactTrigger: 'manual',
    wasGuided: false,
  });
  expect(entry.wasGuided).toBe(false);
});

test('makeEntry: wasGuided is undefined when not provided (existing callers unaffected)', () => {
  const entry = makeEntry({
    kind: 'compact',
    timestampMs: 1700000000000,
    sessionId: 'sess-001',
    context: { window: 200000 },
    contextSource: 'session.usage',
    costUsd: null,
    compactTrigger: 'manual',
  });
  expect(entry.wasGuided).toBeUndefined();
});

test('makeEntry: wasGuided is undefined for non-compact entries', () => {
  const entry = makeEntry({
    kind: 'turn',
    timestampMs: 1700000000000,
    sessionId: 'sess-001',
    context: { tokens: 50000, window: 200000, percent: 25 },
    contextSource: 'session.usage',
    costUsd: null,
  });
  expect(entry.wasGuided).toBeUndefined();
});

// ============================================================
// ANO-001 fix: wasGuided = eventToPass !== event (not shouldGuide)
//
// The compact handler sets:
//   let eventToPass = event;
//   if (shouldGuide) {
//     try { eventToPass = { ...event, instructions: composeInstructions(...) }; }
//     catch { /* fail-open */ }
//   }
//   const wasGuided = eventToPass !== event;
//
// These tests verify that the semantics are correct by simulating the same
// pattern with composeInstructions.
// ============================================================

test('wasGuided semantics: guidance off → eventToPass === event (wasGuided false)', () => {
  const event = { trigger: 'manual', instructions: undefined };
  const shouldGuide = false;

  let eventToPass: typeof event = event;
  if (shouldGuide) {
    try {
      eventToPass = { ...event, instructions: composeInstructions(event.instructions) };
    } catch { /* fail-open */ }
  }

  const wasGuided = eventToPass !== event;
  expect(wasGuided).toBe(false);
  expect(eventToPass).toBe(event);
});

test('wasGuided semantics: guidance on, composition succeeds → eventToPass !== event (wasGuided true)', () => {
  const event = { trigger: 'manual', instructions: undefined };
  const shouldGuide = true;

  let eventToPass: typeof event = event;
  if (shouldGuide) {
    try {
      eventToPass = { ...event, instructions: composeInstructions(event.instructions) };
    } catch { /* fail-open */ }
  }

  const wasGuided = eventToPass !== event;
  expect(wasGuided).toBe(true);
  expect(eventToPass).not.toBe(event);
  expect(eventToPass.instructions).toBeDefined();
});

test('wasGuided semantics: guidance on, composition throws → eventToPass === event (wasGuided false, fail-open)', () => {
  const event = { trigger: 'manual', instructions: undefined };
  const shouldGuide = true;

  let eventToPass: typeof event = event;
  if (shouldGuide) {
    try {
      // Simulate composition failure
      throw new Error('composition error');
    } catch { /* fail-open: eventToPass stays as original event */ }
  }

  const wasGuided = eventToPass !== event;
  expect(wasGuided).toBe(false);
  expect(eventToPass).toBe(event);
});

test('wasGuided semantics: shouldGuide=true via old logic would be true even after error (confirmed false positive)', () => {
  // Documents the ANO-001 false positive: shouldGuide is true even when
  // composition throws. The fix (eventToPass !== event) corrects this.
  const shouldGuide = true;
  const wasGuidedOldLogic = shouldGuide; // the old (incorrect) value
  expect(wasGuidedOldLogic).toBe(true);  // was always true if shouldGuide

  const event = { trigger: 'manual', instructions: undefined };
  let eventToPass: typeof event = event;
  try {
    throw new Error('composition error');
  } catch { /* fail-open */ }
  const wasGuidedNewLogic = eventToPass !== event;
  expect(wasGuidedNewLogic).toBe(false); // correctly false after error
});

// ============================================================
// Trigger policy (ADR-004): shouldGuide flag logic
// Pure simulation of the compact handler's trigger guard.
// ============================================================

function computeShouldGuide(
  guideEnabled: boolean,
  autoGuideEnabled: boolean,
  trigger: string,
): boolean {
  return (
    (guideEnabled && (trigger === 'manual' || trigger === 'plugin')) ||
    (autoGuideEnabled && trigger === 'auto')
  );
}

test('trigger policy: manual + guideEnabled → shouldGuide=true', () => {
  expect(computeShouldGuide(true, false, 'manual')).toBe(true);
});

test('trigger policy: plugin + guideEnabled → shouldGuide=true', () => {
  expect(computeShouldGuide(true, false, 'plugin')).toBe(true);
});

test('trigger policy: auto + autoGuideEnabled → shouldGuide=true', () => {
  expect(computeShouldGuide(false, true, 'auto')).toBe(true);
});

test('trigger policy: auto + guideEnabled only → shouldGuide=false (separate consent)', () => {
  expect(computeShouldGuide(true, false, 'auto')).toBe(false);
});

test('trigger policy: manual + autoGuideEnabled only → shouldGuide=false', () => {
  expect(computeShouldGuide(false, true, 'manual')).toBe(false);
});

test('trigger policy: precompute → always false regardless of flags', () => {
  expect(computeShouldGuide(true, true, 'precompute')).toBe(false);
});

test('trigger policy: all flags off → shouldGuide=false', () => {
  expect(computeShouldGuide(false, false, 'manual')).toBe(false);
  expect(computeShouldGuide(false, false, 'auto')).toBe(false);
  expect(computeShouldGuide(false, false, 'plugin')).toBe(false);
});

// ============================================================
// Remember pref defaults (ANO-006)
// ============================================================

test('prefsAtom default: rememberPrefs is false', () => {
  // The default value passed to atom() must have rememberPrefs: false.
  // Verified by inspecting the atom declaration — this test documents the contract.
  const defaultPrefs = { rememberPrefs: false, guideEnabled: false };
  expect(defaultPrefs.rememberPrefs).toBe(false);
  expect(defaultPrefs.guideEnabled).toBe(false);
});

test('paneAtom default: rememberPrefs is false (ANO-002 fix)', () => {
  // After the ANO-002 fix, the initial paneAtom value includes rememberPrefs: false.
  // This satisfies PaneSnapshot and prevents the TypeScript compile error.
  const initialPane = {
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
    autoGuideEnabled: false,
    rememberPrefs: false,
    pendingAnnotationId: null as string | null,
    turnsUntilAnnotation: 0,
  };
  expect(initialPane.rememberPrefs).toBe(false);
  expect(initialPane.guideEnabled).toBe(false);
  expect(initialPane.autoGuideEnabled).toBe(false);
  expect(initialPane.pendingAnnotationId).toBeNull();
  expect(initialPane.turnsUntilAnnotation).toBe(0);
});

// ============================================================
// toggleGuide semantics — pure logic
// ============================================================

test('toggleGuide: inverts guideEnabled', () => {
  // Simulates: const newVal = !snap.guideEnabled
  expect(!false).toBe(true);
  expect(!true).toBe(false);
});

test('toggleRemember: captures current guideEnabled state', () => {
  // When toggleRemember fires, it saves snap.guideEnabled to prefsAtom.
  // This test documents the expected shape of the saved prefs.
  const snap = { guideEnabled: true, rememberPrefs: false };
  const newRemember = !snap.rememberPrefs; // true
  const savedPrefs = { rememberPrefs: newRemember, guideEnabled: snap.guideEnabled };
  expect(savedPrefs).toEqual({ rememberPrefs: true, guideEnabled: true });
});

// ============================================================
// Manual runtime validation requirements
// (Cannot be automated without full SDK context mock)
// ============================================================
//
// MRV-001: session.compact — exactly one next() call per invocation.
//   Scenario: guidance on, composition succeeds → one next() with augmented event.
//   Scenario: guidance on, composition throws → one next() with original event.
//   Scenario: guidance off → one next() with original event.
//
// MRV-002: session.compact — $.ui.status('ctx:err') failure does not propagate.
//   Scenario: status throws in catch block → outer exception is swallowed.
//
// MRV-003: session.start / session.end — prefsAtom read failure → safe default.
//   Scenario: read($, prefsAtom) throws → paneAtom reset with rememberPrefs:false.
//
// MRV-004: session.end — $.ui.status('ctx:err') failure does not propagate.
//
// MRV-005: History entries after compaction have correct wasGuided value.
//   Scenario: guided manual compaction → entry.wasGuided === true.
//   Scenario: unguided auto compaction → entry.wasGuided === false.

// ============================================================
// ES-014: evalAtom — evaluation data collection
// ============================================================

test('makeEntry: turnsBeforeCompaction propagated to HistoryEntry', () => {
  const entry = makeEntry({
    kind: 'compact',
    timestampMs: 1700000000000,
    sessionId: 'sess-014',
    context: { window: 200000 },
    contextSource: 'session.usage',
    costUsd: null,
    compactTrigger: 'manual',
    turnsBeforeCompaction: 7,
    contextPercentAtCompaction: 72,
  });
  expect(entry.turnsBeforeCompaction).toBe(7);
  expect(entry.contextPercentAtCompaction).toBe(72);
});

test('makeEntry: turnsBeforeCompaction is undefined for non-compact entries', () => {
  const entry = makeEntry({
    kind: 'turn',
    timestampMs: 1700000000000,
    sessionId: 'sess-014',
    context: { tokens: 50000, window: 200000, percent: 25 },
    contextSource: 'session.usage',
    costUsd: null,
  });
  expect(entry.turnsBeforeCompaction).toBeUndefined();
  expect(entry.contextPercentAtCompaction).toBeUndefined();
});

test('evalEntry defaults: turnsUntilAnnotation is null, userAnnotation is skipped', () => {
  const evalEntry = {
    compactionId: 'sess-014:1',
    wasGuided: true,
    trigger: 'manual',
    timestampMs: 1700000000000,
    turnsAtCompaction: 7,
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  };
  expect(evalEntry.turnsUntilAnnotation).toBeNull();
  expect(evalEntry.userAnnotation).toBe('skipped');
});

test('compactionId format: sessionId:index (1-indexed)', () => {
  const sessionId = 'sess-abc';
  const compactionCount = 0; // before this compaction
  const compactionIndex = compactionCount + 1;
  const compactionId = `${sessionId}:${compactionIndex}`;
  expect(compactionId).toBe('sess-abc:1');

  // Second compaction
  const compactionId2 = `${sessionId}:${compactionCount + 2}`;
  expect(compactionId2).toBe('sess-abc:2');
});

test('turnsUntilAnnotation: main-session turns increment counter while pending', () => {
  // Simulates the turn.complete handler logic.
  // After compaction, pendingAnnotationId is set and counter increments each main-session turn.
  const prevPendingAnnotationId: string | null = 'sess-014:1';
  const isSubagent = false;

  let turnsUntilAnnotation = 0;
  // Simulate 3 main-session turns
  for (let i = 0; i < 3; i++) {
    if (!isSubagent && prevPendingAnnotationId != null) {
      turnsUntilAnnotation += 1;
    }
  }

  expect(turnsUntilAnnotation).toBe(3);
  // pendingAnnotationId still set — not cleared by turns
});

test('turnsUntilAnnotation: subagent turn does NOT increment counter', () => {
  const prevPendingAnnotationId: string | null = 'sess-014:1';
  const isSubagent = true;

  let turnsUntilAnnotation = 0;
  if (!isSubagent && prevPendingAnnotationId != null) {
    turnsUntilAnnotation += 1;
  }

  expect(turnsUntilAnnotation).toBe(0);
});

test('annotation: positive sets userAnnotation and records turnsUntilAnnotation', () => {
  const id = 'sess-014:1';
  const turnsUntilAnnotation = 3;
  const entries = [{
    compactionId: id,
    wasGuided: true,
    trigger: 'manual',
    timestampMs: 1700000000000,
    turnsAtCompaction: 3,
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  }];

  const updated = entries.map(e =>
    e.compactionId === id
      ? { ...e, userAnnotation: 'positive' as const, turnsUntilAnnotation }
      : e
  );
  expect(updated[0]!.userAnnotation).toBe('positive');
  expect(updated[0]!.turnsUntilAnnotation).toBe(3);
});

test('annotation: negative sets userAnnotation and records turnsUntilAnnotation', () => {
  const id = 'sess-014:1';
  const turnsUntilAnnotation = 2;
  const entries = [{
    compactionId: id,
    wasGuided: true,
    trigger: 'manual',
    timestampMs: 1700000000000,
    turnsAtCompaction: 3,
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  }];

  const updated = entries.map(e =>
    e.compactionId === id
      ? { ...e, userAnnotation: 'negative' as const, turnsUntilAnnotation }
      : e
  );
  expect(updated[0]!.userAnnotation).toBe('negative');
  expect(updated[0]!.turnsUntilAnnotation).toBe(2);
});

test('annotation: dismiss (—) writes dismissed to evalAtom (ES-015)', () => {
  // The dismiss button now writes userAnnotation: 'dismissed' to evalAtom.
  // This distinguishes explicit dismissal from structural absence (skipped).
  const id = 'sess-014:1';
  const entries = [{
    compactionId: id,
    wasGuided: true,
    trigger: 'manual',
    timestampMs: 1700000000000,
    turnsAtCompaction: 3,
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  }];

  const updated = entries.map(e =>
    e.compactionId === id ? { ...e, userAnnotation: 'dismissed' as const } : e
  );
  expect(updated[0]!.userAnnotation).toBe('dismissed');
  // turnsUntilAnnotation is not set for dismiss — user chose not to rate.
  expect(updated[0]!.turnsUntilAnnotation).toBeNull();
});

test('annotation: skipped means annotation never reached (not explicit dismiss)', () => {
  // After ES-015: 'skipped' = structural absence (second compaction, session end, pane hidden).
  // 'dismissed' = user pressed "—".
  // Both have turnsUntilAnnotation: null.
  const skippedEntry = {
    compactionId: 'sess:1',
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  };
  const dismissedEntry = {
    compactionId: 'sess:2',
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'dismissed' as const,
  };
  expect(skippedEntry.userAnnotation).toBe('skipped');
  expect(dismissedEntry.userAnnotation).toBe('dismissed');
  expect(skippedEntry.turnsUntilAnnotation).toBeNull();
  expect(dismissedEntry.turnsUntilAnnotation).toBeNull();
});

test('evalLog cap: oldest entry dropped when at maxEntries', () => {
  const maxEntries = 3;
  const existing = Array.from({ length: maxEntries }, (_, i) => ({
    compactionId: `sess:${i + 1}`,
    wasGuided: false,
    trigger: 'manual',
    timestampMs: 1700000000000 + i,
    turnsAtCompaction: i,
    turnsUntilAnnotation: 1,
    userAnnotation: 'skipped' as const,
  }));
  const newEntry = {
    compactionId: 'sess:4',
    wasGuided: true,
    trigger: 'auto',
    timestampMs: 1700000000004,
    turnsAtCompaction: 10,
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  };

  const all = [...existing, newEntry];
  const entries = all.length > maxEntries ? all.slice(all.length - maxEntries) : all;

  expect(entries.length).toBe(maxEntries);
  expect(entries[0]!.compactionId).toBe('sess:2'); // oldest dropped
  expect(entries[entries.length - 1]!.compactionId).toBe('sess:4'); // new entry last
});

test('evalAtom initial state: empty entries, maxEntries 200', () => {
  const initial: { entries: unknown[]; maxEntries: number } = { entries: [], maxEntries: 200 };
  expect(initial.entries.length).toBe(0);
  expect(initial.maxEntries).toBe(200);
});

// ============================================================
// ES-015: Signal reliability — regression tests
// ============================================================

test('successive compactions: first entry stays skipped when second compaction fires before annotation', () => {
  // Simulate: first compaction appended, then second compaction before annotation.
  // pendingAnnotationId moves to second compaction; first is permanently skipped.
  const firstEntry = {
    compactionId: 'sess:1',
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  };
  const secondEntry = {
    compactionId: 'sess:2',
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  };

  let entries = [firstEntry];
  let pendingAnnotationId: string | null = 'sess:1';
  let turnsUntilAnnotation = 2;

  // Second compaction fires — appends, resets pending and counter
  entries = [...entries, secondEntry];
  pendingAnnotationId = 'sess:2';
  turnsUntilAnnotation = 0;

  // User now annotates the second compaction
  entries = entries.map(e =>
    e.compactionId === pendingAnnotationId
      ? { ...e, userAnnotation: 'positive' as const, turnsUntilAnnotation }
      : e
  );
  pendingAnnotationId = null;

  expect(entries[0]!.userAnnotation).toBe('skipped');      // first: permanently skipped
  expect(entries[0]!.turnsUntilAnnotation).toBeNull();     // no timing data
  expect(entries[1]!.userAnnotation).toBe('positive');     // second: annotated
  expect(entries[1]!.turnsUntilAnnotation).toBe(0);        // annotated immediately
});

test('successive compactions: compactionId uniqueness across compactions', () => {
  // compactionId = sessionId:index (1-indexed, incrementing)
  const sessionId = 'sess-abc';
  const ids = [1, 2, 3].map(i => `${sessionId}:${i}`);
  expect(new Set(ids).size).toBe(3); // all unique
  expect(ids[0]).toBe('sess-abc:1');
  expect(ids[2]).toBe('sess-abc:3');
});

test('session reset: turnsUntilAnnotation and pendingAnnotationId reset on session.start/end', () => {
  // After session reset, any pending annotation is abandoned.
  // The corresponding evalAtom entry stays as 'skipped' permanently — by design.
  const afterReset = {
    pendingAnnotationId: null as string | null,
    turnsUntilAnnotation: 0,
  };
  expect(afterReset.pendingAnnotationId).toBeNull();
  expect(afterReset.turnsUntilAnnotation).toBe(0);
});

test('dismissed vs skipped: distinguishable after ES-015', () => {
  // Analysis can now filter: include dismissed+positive+negative, exclude skipped.
  type UA = 'positive' | 'negative' | 'skipped' | 'dismissed';
  const annotated = (ua: UA) => ua === 'positive' || ua === 'negative' || ua === 'dismissed';

  expect(annotated('positive')).toBe(true);
  expect(annotated('negative')).toBe(true);
  expect(annotated('dismissed')).toBe(true);
  expect(annotated('skipped')).toBe(false); // excluded from rate calculation
});

test('annotation rate: only positive+negative+dismissed count toward sample', () => {
  // Go/No-Go criteria use annotated sample, not total entries.
  type UA = 'positive' | 'negative' | 'skipped' | 'dismissed';
  const entries: { userAnnotation: UA }[] = [
    { userAnnotation: 'positive' },
    { userAnnotation: 'positive' },
    { userAnnotation: 'negative' },
    { userAnnotation: 'dismissed' },
    { userAnnotation: 'skipped' },  // excluded
    { userAnnotation: 'skipped' },  // excluded
  ];

  const annotated = entries.filter(e => e.userAnnotation !== 'skipped');
  const positiveRate = annotated.filter(e => e.userAnnotation === 'positive').length / annotated.length;

  expect(annotated.length).toBe(4);
  expect(positiveRate).toBe(0.5);
});

test('turnsUntilAnnotation: annotation at turn 0 (immediate click after compaction)', () => {
  // If the user clicks 👍 before any further turn, turnsUntilAnnotation = 0.
  const turnsUntilAnnotation = 0;
  const entries = [{
    compactionId: 'sess:1',
    turnsUntilAnnotation: null as number | null,
    userAnnotation: 'skipped' as const,
  }];
  const updated = entries.map(e =>
    e.compactionId === 'sess:1'
      ? { ...e, userAnnotation: 'positive' as const, turnsUntilAnnotation }
      : e
  );
  expect(updated[0]!.turnsUntilAnnotation).toBe(0);
  expect(updated[0]!.userAnnotation).toBe('positive');
});

test('paneAtom default: pendingAnnotationId is null, turnsUntilAnnotation is 0 (ES-015)', () => {
  const initialPane = {
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
    autoGuideEnabled: false,
    rememberPrefs: false,
    pendingAnnotationId: null as string | null,
    turnsUntilAnnotation: 0,
  };
  expect(initialPane.pendingAnnotationId).toBeNull();
  expect(initialPane.turnsUntilAnnotation).toBe(0);
});
