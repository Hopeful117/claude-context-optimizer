# Claude Context Optimizer

Local-first context intelligence for Claude Code, including the Code experience in Claude Desktop where supported.

> Status: **Phase 2 — Stabilization & Effectiveness**. V1 (ES-001–ES-007) is implemented. ES-008 stabilizes V1 before effectiveness evaluation.

## Product direction

- **V1 — Context Advisor:** observe sessions, analyze available usage/context metrics, and provide explainable recommendations. No automatic compaction, session reset, or prompt/tool modification.
- **Long term — Context Orchestrator:** user-controlled context lifecycle management, handoffs, and session transitions, contingent on supported interfaces and measured value.

The objective is to reduce **avoidable** context overhead while preserving useful prompt caching, output quality, privacy, and developer productivity. Cache-read tokens are not inherently waste.

## Principles

- Local-first; no mandatory external service or LLM calls for baseline analysis.
- Read-only recommendations in V1; no interception of credentials or undocumented internal APIs.
- Prefer official integration surfaces; validate their real capabilities before committing to a runtime.
- Collect minimum necessary metadata; avoid storing prompt bodies, source code, or secrets by default.
- Measure outcomes against comparable tasks, including work completed and quality, not just token counts.

## Documentation

- [Product vision](docs/vision.md)
- [Roadmap and validation gates](docs/roadmap.md)
- [Architecture decisions](docs/architecture/README.md)
- [ADR-001: integration boundary and stack selection](docs/architecture/ADR-001-integration-and-stack.md)
- [ADR-002: local-first observability](docs/architecture/ADR-002-observability-and-privacy.md)
- [ADR-003: advisory-only V1](docs/architecture/ADR-003-advisory-first.md)

## Development

The Mod installs as `context-optimizer` under `~/.claude/dev-mods/<session-id>/context-optimizer/`. Hot-reload is active during development.

Current milestone: **ES-008 — Context Advisor V1 Stabilization** — fixing post-compaction display consistency, evidence formatting, turn counter semantics, and hook resilience. See [ES-008 engineering story](docs/stories/ES-008-context-advisor-v1-stabilization.md).

## License

Not yet selected.
