# Roadmap

## Phase 0 — Feasibility spike (next)

1. Confirm exact supported Claude Code and Claude Desktop extension mechanisms and minimum versions.
2. Test installation and execution of a minimal extension in the intended Desktop Code environment.
3. Inspect documented event payloads, session identifiers, token/cache counters, and any supported UI surface.
4. Compare direct plugin events, status-line data, local logs, and optional OpenTelemetry export; record availability and provenance.
5. Measure overhead and permissions. Produce a written go/no-go assessment and stack decision.

**Exit gate:** at least one reliable session identifier, usable metrics/events, and a feasible way to present recommendations. Otherwise revise scope rather than invent unsupported APIs.

## Phase 1 — Context Advisor MVP

- Session observer and normalized usage events.
- Local metrics history with retention policy.
- Explainable heuristics and uncertainty labels.
- Read-only reporting surface.
- Tests with synthetic fixtures and sample sessions.

**Exit gate:** reproducible measurements, negligible observer overhead, no automatic session changes.

## Phase 2 — Validation

- Baseline vs advisor-assisted comparable tasks.
- Measure task completion, quality, elapsed time, token breakdown, cache behavior, and observed quota indicators where available.
- Investigate false-positive recommendations.

## Future — Context Orchestrator

- Structured handoff drafts and user-confirmed session transitions.
- Policy engine and audit trail.
- Optional supported integrations only after separate ADRs and user approval.

No dates or savings percentages are promised before measurement.
