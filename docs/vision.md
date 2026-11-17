# Product vision

## Problem

Long-running Claude Code sessions can accumulate large context and repeated tool results. Usage reports may show substantial cache reads, but cache hits are often efficient; raw cache-read volume alone does **not** establish wasted quota or a causal relationship with subscription limits.

## Target users

Developers using Claude Code, including its supported experience inside Claude Desktop.

## V1: Context Advisor

Observe supported session events and available token/cache measurements, keep a local history, detect explainable trends, and recommend whether to continue, investigate context growth, compact, or prepare a new session. Recommendations are advisory, reversible, and evidence-linked.

### Non-goals for V1

- Automatically calling /compact, clearing sessions, rewriting prompts, or blocking tools.
- Claiming access to Anthropic's internal cache or subscription quota calculation.
- Requiring a remote backend, additional LLM, or independent desktop application.
- Reading/storing full conversation content by default.

## Long-term: Context Orchestrator

With explicit user control and separate design decisions, support structured handoffs, session transitions, and policy-driven context lifecycle operations. Every automated capability requires verified interfaces, safety review, and measured benefit.

## Success criteria

- Accurate provenance and limitations for each reported metric.
- Low observer overhead and no degradation of Claude workflows.
- Privacy-preserving local storage and clear retention/deletion controls.
- Measurable improvements on comparable engineering tasks, with quality and completion as guardrails.
