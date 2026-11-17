# ADR-001 — Claude Code Mod integration boundary and stack selection

- Status: **Accepted**
- Date: 2026-11-17
- Updated: 2026-11-17 — explicit Mod-only product decision

## Context

Claude Context Optimizer targets Claude Code, including its integration in Claude Desktop's Code experience where supported. The product is an extension, not a standalone backend. The user has explicitly chosen **Claude Code Mods**, rather than MCP Apps, as the product's integration mechanism.

The existence, availability, permissions, event schema, and UI/telemetry capabilities of the relevant Mods interfaces must still be validated against the currently supported documentation and an actual installation. Choosing the integration mechanism does not establish that any particular API exists.

## Decision

1. **Claude Code Mods are the selected integration boundary.** Do not implement the product as an MCP App or substitute an MCP server for the Mod.
2. **TypeScript is the preferred implementation language**, conditional on the actual supported Mod runtime and tooling. Validate the SDK/API and minimum versions before scaffolding.
3. The first deliverable is a small Mod feasibility spike: installation, session observation, available usage/cache metrics, supported UI, and bounded local persistence.
4. V1 remains **read-only Context Advisor**. No automatic compaction, session resets, prompt rewriting, or interception of internal requests.
5. No Java/Spring, Python service, remote backend, or additional LLM calls by default.
6. Use only documented and supported integration surfaces; do not access private credentials or reverse-engineer internal network traffic.
7. If the Mod API cannot expose a required metric or UI surface, document that limitation and adjust V1 scope **within the Mod approach**; do not silently switch to MCP Apps.

## Consequences

- ES-001 validates the Mod SDK, version compatibility, actual event payloads, provenance of counters, UI and storage constraints, and observer overhead.
- Product decisions are firm; implementation details remain provisional until the spike.
- The Mod may report metrics as unavailable when the platform does not expose them.
- No claim of direct subscription quota accounting without documented evidence.

## Alternatives considered

- **MCP Apps:** explicitly excluded as the product integration mechanism; DevLog's MCP App can inform general UX or observability lessons, but is not the architecture for this project.
- Separate local daemon: not justified for V1.
- Java/Spring or Python backend: not justified without a concrete requirement.
