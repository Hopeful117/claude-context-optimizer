# ES-001 — Claude Code Mod Integration & Observability Spike

- Status: **Proposed — awaiting implementation**
- Type: **Technical feasibility spike**
- Governing decisions: ADR-001, ADR-002, ADR-003

## Goal

Validate that a **Claude Code Mod** can serve as the native, lightweight foundation for Context Advisor V1 in Claude Code and the intended Claude Desktop Code experience. The spike must distinguish documented capabilities from features proven in the user's environment.

## In scope

1. Identify the current official Mods documentation, installation method, SDK/runtime, version requirements, permission model, and supported host environments.
2. Build the smallest possible Mod and verify loading/unloading in the intended host.
3. Inventory supported lifecycle/session events and their payloads; distinguish top-level sessions from subagents when available.
4. Test access to context-window utilization, token input/output, prompt cache read/write, model and timestamps. Record source, units, sampling scope, and missing fields.
5. Validate any officially supported native Mod UI/panel. If no such surface is available, report that limitation without switching to MCP Apps.
6. Test bounded local persistence of **metadata only**, with no prompt/code/tool bodies or secrets.
7. Measure CPU/memory/startup and event-handling overhead on a small repeatable scenario.
8. Record limitations, platform differences, and a recommendation for MVP architecture.

## Explicit non-goals

- MCP Apps or MCP-server-based plugin architecture.
- Subscription quota estimates derived from undocumented internals.
- Automatic compaction, handoffs, session resets, or tool/prompt interception.
- Production-grade dashboard, long-term telemetry schema, or external backend.
- Assuming cache reads are wasted tokens.

## Acceptance criteria

- [ ] Exact tested Claude Code/Desktop versions and Mod SDK/API references are documented.
- [ ] Minimal Mod can be installed and executed, or a reproducible blocker is recorded.
- [ ] Event and metric availability matrix records **available / unavailable / unverified**, provenance, and limitations.
- [ ] Native UI feasibility is demonstrated or explicitly documented as unsupported.
- [ ] Privacy and permissions review confirms no default collection of sensitive content.
- [ ] Overhead measurement method and observed results are documented (no invented benchmarks).
- [ ] A go/no-go report recommends a minimal V1 architecture, with unresolved risks.

## Deliverables

- Minimal experimental Mod (only after SDK verification).
- `docs/investigations/ES-001-mod-feasibility-report.md` containing evidence, test environment, event/metric matrix, overhead and decision.
- Follow-up ADR if empirical results require a change to the runtime or product scope.

## Working sequence

1. **Research** official Mod interfaces and capture evidence.
2. **Implement** the smallest supported skeleton.
3. **Observe** real events/metrics and test native UI.
4. **Evaluate** privacy and overhead.
5. **Decide** MVP boundaries from demonstrated capabilities.

Do not treat an MCP App implementation from DevLog as evidence that the Mod API exposes equivalent hooks or UI.
