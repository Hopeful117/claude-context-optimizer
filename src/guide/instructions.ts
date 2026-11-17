// Static preservation template for guided compaction (ES-010 prototype).
// Pure module — no engine calls, no session state, fully testable.
//
// The template is a summarizer directive, not a data extraction mechanism.
// The Mod does not analyze the conversation; it tells the summarizer what to
// prioritize. The summarizer may or may not follow the guidance — that
// variance is part of what ES-010 evaluates (hypothesis H2).

export const PRESERVATION_TEMPLATE =
  'Preservation priorities for this summary:\n' +
  '1. Active task: the specific goal or question currently being worked toward.\n' +
  '2. Work state: what is complete, what is in progress, what is blocked.\n' +
  '3. Key decisions: technical choices made and the reason behind each.\n' +
  '4. Technical constraints: requirements, acceptance criteria, and known invariants.\n' +
  '5. Relevant files: exact file paths and components being actively modified.\n' +
  '6. Open questions: unresolved issues that must still be addressed.\n' +
  '7. Next steps: the immediate actions planned before this compaction.\n' +
  '\nPrioritize stable, factual state over ephemeral observations or one-off tool outputs.';

/** Maximum length of the composed string. Existing instructions are never truncated. */
export const MAX_COMPOSED_LENGTH = 2000;

const SEPARATOR = '\n\n---\n';

/**
 * Compose preservation instructions from optional existing instructions and the
 * static template.
 *
 * Rules (from ADR-004 §Compaction Instruction Strategy):
 * - Existing instructions appear first, unchanged.
 * - Template is appended after a separator.
 * - If the full composition exceeds MAX_COMPOSED_LENGTH, the template is truncated
 *   to fit — existing instructions are never shortened.
 * - If there is no room for the template at all, existing instructions are returned
 *   unchanged.
 * - If there are no existing instructions, the template is returned alone.
 */
export function composeInstructions(existing: string | undefined): string {
  if (!existing) return PRESERVATION_TEMPLATE;

  const full = existing + SEPARATOR + PRESERVATION_TEMPLATE;
  if (full.length <= MAX_COMPOSED_LENGTH) return full;

  const available = MAX_COMPOSED_LENGTH - existing.length - SEPARATOR.length;
  if (available <= 0) return existing;

  return existing + SEPARATOR + PRESERVATION_TEMPLATE.slice(0, available);
}
