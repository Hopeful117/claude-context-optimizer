# ADR-003 — Advisory-first product evolution

- Status: **Accepted**
- Date: 2026-11-17

## Context

Context operations such as compaction or resetting a session can lose valuable task state. Automated optimization is risky without reliable metrics and evidence of benefit.

## Decision

1. **V1 is Context Advisor**: observe, analyze, and recommend, with explanations and uncertainty.
2. No automatic compaction, session reset, handoff execution, prompt rewriting, or tool interception in V1.
3. **Context Orchestrator** is the long-term direction, contingent on evidence, supported interfaces, explicit user control, and separate safety/architecture decisions.
4. Recommendations must be evaluated on comparable work: completion, correctness, elapsed time, token/cache behavior, and user effort.
5. Human decisions remain authoritative; recommendations cannot silently alter engineering workflows.

## Consequences

Start with read-only instrumentation and transparent heuristics. Any future write/action capability needs its own ADR, permissions model, rollback strategy, and acceptance criteria.
