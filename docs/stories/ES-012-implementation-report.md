# ES-012 — Implementation Report

- Story: `docs/stories/ES-012-persistent-guidance-toggle.md`
- Plan: `docs/stories/ES-012-implementation-plan.md` ✅ Approved 2026-11-17
- Date: 2026-11-17
- Version: v0.9.1

---

## What Was Built

### Type change: `types/index.d.ts`

Added `rememberPrefs: boolean` to `PaneSnapshot`. No shape bump to `paneAtom` (`pane-2` retained); `undefined` → `false` default is safe for existing sessions.

### Hook change: `hooks/register.tsx`

**New `prefsAtom`** (declared after `historyAtom`):
- Key `{ plugin: 'context-optimizer', key: 'prefs' }`, shape `'prefs-1'`.
- Default: `{ rememberPrefs: false, guideEnabled: false }`.
- Never reset in `session.start` or `session.end` — persists across sessions in `$.store`.

**`session.start`**: reads `prefsAtom` before `paneAtom` reset; initializes `guideEnabled` from `prefsAtom.guideEnabled` when `rememberPrefs` is `true`, else `false`. Sets `rememberPrefs` from `prefsAtom.rememberPrefs`.

**`session.end` (clear/resume)**: same pattern as `session.start`.

**`toggleGuide`** (updated): additionally updates `prefsAtom.guideEnabled` when `snap.rememberPrefs` is `true`.

**`toggleRemember`** (new): toggles `prefsAtom.rememberPrefs` and saves current `guideEnabled` to `prefsAtom` atomically. Both fire-and-forget (`void`) consistent with `onPress: () => void` constraint.

**Pane render** (Compaction Guidance section): added a second row with a "Remember" `Button` (primary variant when active, default when not) and descriptive dimmed text.

### Plugin manifest: `.claude-plugin/plugin.json`

Version bumped `0.9.0` → `0.9.1`.

---

## Acceptance Criteria Verification

| # | Criterion | Status |
|---|---|---|
| AC-1 | "Remember" toggle in pane Compaction Guidance section | ✅ |
| AC-2 | Remember off → `guideEnabled` resets to `false` on session start | ✅ `prefs.rememberPrefs ? prefs.guideEnabled : false` |
| AC-3 | Remember on → `guideEnabled` restored from `prefsAtom` on session start | ✅ |
| AC-4 | Remember turned off → future sessions start with `false` | ✅ `toggleRemember` saves `rememberPrefs: false` to `prefsAtom` |
| AC-5 | Preference survives `/clear` and app restart | ✅ `prefsAtom` never reset, lives in `$.store` |
| AC-6 | No change to compaction logic | ✅ `session.compact` handler untouched |
| AC-7 | `PaneSnapshot.rememberPrefs: boolean` + `prefsAtom` with shape `prefs-1` | ✅ |
| AC-7b | `pane-2` shape retained | ✅ |

---

## Quality Validation

**Command:** `/home/ludo/.config/Claude/claude-code/2.1.325/00b1b977bcc3/claude plugin test .`

| Check | Result |
|---|---|
| TypeScript (implicit in plugin test runner) | Pass |
| Vitest — 142 tests across 9 files | 141 pass, **1 pre-existing fail** |

**Pre-existing failure** (`src/guide/instructions.test.ts` — `PRESERVATION_TEMPLATE: within reasonable length`):
- Expects `< 600` chars; actual is `640`.
- Exists on `HEAD` before ES-012 changes (confirmed by running tests on stashed state).
- Unrelated to this story — template is in `src/guide/instructions.ts`, untouched by ES-012.
- Registered as a known issue to address in a future story.

---

## Documentation Update

- `AGENTS.md`: version updated to v0.9.1; ES-012 status updated to "implemented".
- `docs/stories/ES-012-persistent-guidance-toggle.md`: status updated to "Implemented — Pending PR".
- `.claude-plugin/plugin.json`: version bumped to `0.9.1`.

No other documentation required: `TOOLS.md`, `docs/roadmap.md`, `docs/architecture/` are unaffected.

**Documentation update: Minimal — version bump and story status only.**

---

## Vault Outcome

Vault was not consulted during Repository Analysis (not applicable for this in-repo plugin change). No new vault note warranted — the story is a small additive preference feature with no cross-project insights.

**Vault outcome: No action.**

---

## Modified Files

| File | Change |
|---|---|
| `types/index.d.ts` | +2 lines |
| `hooks/register.tsx` | +33 lines (prefsAtom, session handlers, toggles, pane) |
| `.claude-plugin/plugin.json` | version + description |
| `AGENTS.md` | version + story status |
| `docs/stories/ES-012-persistent-guidance-toggle.md` | status |

New files (story artifacts, not shipped):
- `docs/stories/ES-012-repository-analysis.md`
- `docs/stories/ES-012-implementation-plan.md`
- `docs/stories/ES-012-implementation-report.md` (this file)
- `AGENTS.md` (new, shipped)
- `TOOLS.md` (new, shipped)
