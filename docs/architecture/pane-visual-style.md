# Pane Visual Style Guide

- Version: 0.7.0
- Established: ES-007

## Design Intent

The pane renders inside Claude Desktop's sidebar. Its visual language borrows from Claude's own UI: the brand coral as an accent, semantic color for health signals, and restraint everywhere else. The goal is instant legibility — severity and fill level readable in a glance, diagnostics available but not competing.

## Color Palette

Colors are expressed as `ThemeKey` values from the Claude Code SDK. They adapt automatically to light and dark mode and to any future theming changes in Claude Desktop. Raw hex values are never hardcoded.

| ThemeKey | Semantic role | Used for |
|---|---|---|
| `claude` | Brand accent (coral) | Header marker `◆`, observation icons `ℹ`, mild rate-limit level |
| `success` | Healthy / OK | Fill < 70%, stable trend `→`, "no active recommendations" |
| `warning` | Elevated / attention | Fill 70–84%, rising trend `↑`, warning icons `⚠`, rate limit ≥ 90% |
| `error` | Critical | Fill ≥ 85% |
| `subtle` | Muted secondary | Falling trend `↓` (benign post-compaction signal) |
| `inactive` | Absent / unavailable | Fill or trend when value is `null` / `N/A` |
| *(none)* | Default body text | Labels, counts, plain diagnostic lines |
| `dimColor` | Dim (SDK boolean) | Explanations, evidence lines, secondary metadata |

### Fill Color Thresholds

The fill bar and fill percentage share the same color function (`fillColor`), keyed to the advisor rule thresholds:

```
< 70%   → 'success'
70–84%  → 'warning'   (matches CONTEXT_FILL_MEDIUM observation threshold)
≥ 85%   → 'error'     (matches CONTEXT_FILL_HIGH warning threshold)
null    → 'inactive'
```

### Rate Limit Color Thresholds

```
≥ 90%  → 'warning'
≥ 75%  → 'claude'    (early notice; matches RATE_LIMIT_MEDIUM observation)
< 75%  → (none)       default body text
```

## Typography

The terminal surface renders one fixed font size and ignores the `size` prop. Weights that matter:

| Usage | Prop |
|---|---|
| Section headers | `bold` |
| Body text | *(default)* |
| Secondary / metadata | `dimColor` |

`weight='semibold'` and `bold` are equivalent in the terminal; `bold` is used for consistency with the existing codebase.

## Fill Bar

A 10-character Unicode block indicator replaces the raw token count as the primary fill signal. Tokens are shown as a compact secondary label.

```
████████░░  82%  (164k/200k tok)
```

Construction:
- `filled = clamp(0, round(pct / 10), 10)` block characters `█`
- `10 - filled` empty characters `░`
- Null fill → `──────────` (10 en-dashes, `inactive` color)

Token counts use a compact format: values ≥ 1000 are abbreviated to the nearest `k` (`164000 → 164k`). This keeps the overview line under ~40 characters for typical context windows.

## Trend Arrows

The arrow character carries the color; the rest of the string (delta and turn count) renders in default body color.

| Trend | Arrow | Color |
|---|---|---|
| Growing | `↑` | `warning` |
| Stable | `→` | `success` |
| Shrinking | `↓` | `subtle` (decline is benign post-compaction) |
| N/A | *(no arrow)* | `inactive` |

## Severity Icons

Icons appear at the start of each recommendation block. Color reinforces the text-only severity marker; it does not replace it (AC-2).

| Category | Icon | Color |
|---|---|---|
| `warning` | `⚠` | `warning` |
| `action` | `→` | `success` |
| `observation` | `ℹ` | `claude` |

## Information Hierarchy

```
◆  Context Optimizer
────────────────────────

Session Overview          ← Level 1: always visible, top
  ████████░░  82%  (…)
  trend:  ↑ +12%  (3 turns)
  state:  ⚠ 1 warning

Advisor                   ← Level 2: actionable content
  ⚠ Context nearly full
      Context is at 82% …
      contextPercent: 82%  · threshold: 85%

Cache (last turn)         ← Level 3: diagnostics
Rate limits
Cost
Session
Overhead
```

Level 3 is always rendered (the SDK does not support collapsible sections). It is visually subordinate through `dimColor` on secondary lines and its position below the actionable content.

## Structural Rules

1. **One branded header**, once, at the top. No repeated `◆` symbols elsewhere.
2. **Color conveys health, not identity.** Section headers and labels stay in default body color; only data values carry semantic color.
3. **No raw hex.** All colors go through ThemeKey so the pane adapts to future Claude Desktop themes.
4. **No color-only information.** Every colored signal also has a text form (icon, label, bar characters). The pane must be fully legible in a monochrome terminal.
5. **Compact numbers in the overview.** Token counts use `shortTok` (`k` suffix). Full integers appear only in Level 3 diagnostics where precision matters.
