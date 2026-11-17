# ADR-002 — Local-first observability and privacy

- Status: **Accepted**
- Date: 2026-11-17

## Context

Usage and session metadata can be sensitive. Token counters may come from different sources and scopes; cache-read volume is not equivalent to waste or subscription quota consumption.

## Decision

1. Collect only data necessary for V1 analysis, preferably session ID (locally pseudonymized if appropriate), timestamps, model, event type, token/cache counters, and source provenance.
2. Do **not** persist prompt bodies, tool output bodies, repository code, secrets, or credentials by default.
3. Keep data local by default; provide retention and deletion controls before general release.
4. Normalize counters with explicit source, scope, units, and availability; distinguish main-session and subagent data where possible.
5. Never infer exact subscription quota accounting from API-equivalent token costs.
6. Treat cache hits as potentially beneficial; optimize unnecessary context growth, not cache-read volume in isolation.
7. Prefer event-driven collection with bounded overhead; use no LLM calls for baseline analysis.

## Consequences

A schema, access permissions, storage mechanism, and actual retention defaults must be specified during the spike/MVP. Missing metrics are shown as unavailable, never fabricated.
