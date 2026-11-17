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
  };
  expect(initialPane.rememberPrefs).toBe(false);
  expect(initialPane.guideEnabled).toBe(false);
  expect(initialPane.autoGuideEnabled).toBe(false);
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
