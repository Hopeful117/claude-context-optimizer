# ES-012 — Persistent Guidance Toggle State

- Status: **Implemented — Pending PR**
- Date: 2026-11-17
- Version: 0.9.1
- Branch: `claude/es-010-guided-compaction-validation-c5beb0` (ES-012 on top of ES-010)

---

## Objective

Persist the Compaction Guidance toggle state across sessions so users who enable guidance once do not have to re-enable it every session.

The toggle was introduced in ES-010 as an in-session-only flag (`guideEnabled: boolean` in `PaneSnapshot`, always reset to `false` on `session.start`). This story adds an opt-in "Remember" preference that stores the user's guidance preference in `$.store` and restores it at `session.start`.

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | A new "Remember" toggle appears in the Compaction Guidance pane section |
| AC-2 | When "Remember" is off (default), behavior is identical to v0.9.0 — `guideEnabled` resets to `false` on every session start |
| AC-3 | When "Remember" is on: `guideEnabled` state is persisted to `$.store` and restored on the next `session.start` |
| AC-4 | When "Remember" is turned off: `guideEnabled` is no longer restored from store (future sessions start with `false`) |
| AC-5 | The preference survives `/clear` and app restart |
| AC-6 | No behavior change to compaction logic itself — only the initial value of `guideEnabled` at session start is affected |
| AC-7 | `PaneSnapshot` gains `rememberPrefs: boolean`; a new `prefsAtom` stores `{ rememberPrefs: boolean; guideEnabled: boolean }` with shape `'prefs-1'` |
| AC-7 | `paneAtom` shape stays at `'pane-2'` — no state clearing required for this change |

---

## Repository Analysis

See `docs/stories/ES-012-repository-analysis.md` (produced below).
