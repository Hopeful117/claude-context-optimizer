# TOOLS.md — Claude Context Optimizer

Tool configuration for AI coding workflows in this repository.

---

## DevLog

DevLog tracks engineering context, stories, and project history for this repository.

| Field | Value |
|---|---|
| **Project slug** | `claude-context-optimizer` |
| **Project UUID** | `183b1d17-df23-49ce-b632-28b56e7c3d1a` |
| **Base URL** | `http://127.0.0.1:18080` |
| **MCP project slug** | `claude-context-optimizer` |

### DevLog Lifecycle Script

The `scripts/devlog-story.mjs` script manages story lifecycle events (register, start, complete).

It is invoked by the Engineering Story skill at:
- **Register** — when a new story is created
- **Start** — after Gate 2 approval, before implementation
- **Complete** — after PR is merged and local cleanup is done

Usage:
```bash
node scripts/devlog-story.mjs \
  --base-url http://127.0.0.1:18080 \
  --project-id 183b1d17-df23-49ce-b632-28b56e7c3d1a \
  --operation register
# stdin: { storyNumber, title, storyPath }

node scripts/devlog-story.mjs \
  --base-url http://127.0.0.1:18080 \
  --project-id 183b1d17-df23-49ce-b632-28b56e7c3d1a \
  --story-id <uuid> \
  --operation start
# stdin: { baseCommit }

node scripts/devlog-story.mjs \
  --base-url http://127.0.0.1:18080 \
  --project-id 183b1d17-df23-49ce-b632-28b56e7c3d1a \
  --story-id <uuid> \
  --operation complete
# stdin: { targetCommit, baseCommit }
```

> **Note:** The `scripts/devlog-story.mjs` script does not yet exist in this repository.
> It must be created before DevLog lifecycle operations can be used.
> Until then, all DevLog lifecycle steps are skipped (best-effort, non-blocking).

### Story References

Canonical story DevLog UUIDs are recorded in `references/devlog-story.md` once a story is registered.

> `references/devlog-story.md` does not yet exist. It will be created when the first story is registered via the lifecycle script.

---

## MCP Context Tool

The Engineering Story skill calls `mcp__devlog__devlog_story_agent` for pre-analysis engineering context.

The MCP server is configured in Claude Code's MCP settings and connects to the same DevLog backend at `http://127.0.0.1:18080`.

---

## Quality Tools

| Tool | Command | When |
|---|---|---|
| TypeScript | `npm run build` | Every PR |
| Vitest | `npm test` | Every PR |

No SonarQube or external quality gate is configured for this project.
