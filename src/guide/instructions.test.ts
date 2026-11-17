import { expect, test } from 'claude-code/testing';
import {
  composeInstructions,
  PRESERVATION_TEMPLATE,
  MAX_COMPOSED_LENGTH,
} from './instructions';

// ============================================================
// No existing instructions
// ============================================================

test('composeInstructions: undefined → template only', () => {
  expect(composeInstructions(undefined)).toBe(PRESERVATION_TEMPLATE);
});

test('composeInstructions: empty string → template only', () => {
  expect(composeInstructions('')).toBe(PRESERVATION_TEMPLATE);
});

// ============================================================
// Existing instructions present
// ============================================================

test('composeInstructions: short existing → existing + separator + template', () => {
  const existing = 'Focus on the auth module.';
  const result = composeInstructions(existing);
  expect(result.startsWith(existing + '\n\n---\n')).toBe(true);
  expect(result.endsWith(PRESERVATION_TEMPLATE)).toBe(true);
});

test('composeInstructions: existing appears before template', () => {
  const existing = 'Keep the plan.';
  const result = composeInstructions(existing);
  const idx = result.indexOf(existing);
  const tplIdx = result.indexOf('Preservation priorities');
  expect(idx).toBeLessThan(tplIdx);
});

test('composeInstructions: existing is never modified', () => {
  const existing = 'Important instruction.';
  const result = composeInstructions(existing);
  expect(result.includes(existing)).toBe(true);
  // The existing string appears verbatim at the start.
  expect(result.slice(0, existing.length)).toBe(existing);
});

// ============================================================
// Length limits — template truncation, never existing truncation
// ============================================================

test('composeInstructions: composition within MAX_COMPOSED_LENGTH → not truncated', () => {
  const existing = 'Short existing.';
  const result = composeInstructions(existing);
  expect(result.length).toBeLessThanOrEqual(MAX_COMPOSED_LENGTH);
});

test('composeInstructions: existing fills MAX_COMPOSED_LENGTH → existing unchanged, no template', () => {
  const existing = 'x'.repeat(MAX_COMPOSED_LENGTH);
  const result = composeInstructions(existing);
  expect(result).toBe(existing);
});

test('composeInstructions: existing just below limit, no room for template → existing only', () => {
  // existing + separator would already exceed the limit.
  const existing = 'x'.repeat(MAX_COMPOSED_LENGTH - 3);
  const result = composeInstructions(existing);
  // No room for separator + any template content.
  expect(result).toBe(existing);
});

test('composeInstructions: existing + separator fits but template overflows → template truncated', () => {
  // Allow room for separator (6 chars) + partial template, but not full template.
  const separatorLen = '\n\n---\n'.length; // 6 chars
  const templateLen = PRESERVATION_TEMPLATE.length;
  const available = separatorLen + Math.floor(templateLen / 2); // partial room
  const existing = 'x'.repeat(MAX_COMPOSED_LENGTH - available);
  const result = composeInstructions(existing);
  expect(result.length).toBeLessThanOrEqual(MAX_COMPOSED_LENGTH);
  expect(result.startsWith(existing)).toBe(true);
  // Template is partially included (not empty, not full).
  const afterSep = result.slice(existing.length + separatorLen);
  expect(afterSep.length).toBeGreaterThan(0);
  expect(afterSep.length).toBeLessThan(templateLen);
});

// ============================================================
// Template content (smoke test)
// ============================================================

test('PRESERVATION_TEMPLATE: contains expected categories', () => {
  expect(PRESERVATION_TEMPLATE).toContain('Active task');
  expect(PRESERVATION_TEMPLATE).toContain('Work state');
  expect(PRESERVATION_TEMPLATE).toContain('Key decisions');
  expect(PRESERVATION_TEMPLATE).toContain('Technical constraints');
  expect(PRESERVATION_TEMPLATE).toContain('Relevant files');
  expect(PRESERVATION_TEMPLATE).toContain('Open questions');
  expect(PRESERVATION_TEMPLATE).toContain('Next steps');
});

test('PRESERVATION_TEMPLATE: within reasonable length', () => {
  // All 7 ADR-004 categories are required; template is ~640 chars.
  // Threshold guards against unintended growth, not arbitrary compression.
  expect(PRESERVATION_TEMPLATE.length).toBeLessThan(700);
});
