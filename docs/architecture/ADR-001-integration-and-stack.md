# ADR-001 — Integration boundary and stack selection

- Status: **Accepted**
- Date: 2026-11-17

## Context

The product is intended to integrate with Claude Desktop's Code experience and Claude Code, not become a standalone Java/Python service by default. Different extension surfaces (Claude Code plugins/hooks, MCP, and potential SDK/UI integrations) have different permissions and data access. Exact capabilities and version constraints must be verified in a spike.

## Decision

1. Prefer **documented, supported Claude Code/Desktop extension surfaces** and keep the implementation as small as possible.
2. Treat a native Claude Code extension/Mod as the **leading hypothesis**, not a proven compatibility guarantee.
3. Use **TypeScript** as the provisional spike language if the selected official API supports it naturally. Do not select Java/Spring, Python, Rust, or Go by habit.
4. Defer final runtime, packaging, UI, storage engine, and telemetry transport choices until the spike verifies interfaces and deployment constraints.
5. Avoid reverse-engineered request interception, undocumented private APIs, or a mandatory remote service.

## Consequences

- The initial repository contains architecture documents, not an application scaffold.
- The spike must document tested versions, observed payloads, supported environments, security implications, and fallback options.
- If Desktop integration is unsupported or too limited, reconsider the distribution boundary before committing to a stack.

## Alternatives considered

- MCP-only extension: potentially useful for exposing tools, but does not imply passive access to internal usage metrics.
- Separate local daemon: possible later, but adds lifecycle, installation, and security costs.
- Java/Spring or Python backend: unjustified without a concrete integration or processing need.
