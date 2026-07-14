# HOPE Ministry OS — Architecture Decisions

Date established: 2026-07-14

Status: Active Decision Register

## Purpose

This document records durable architectural decisions once, in one authoritative location.

Other documents should reference these decisions rather than restating their full rationale.

## Decision Format

Each decision records:

- status;
- date;
- decision;
- rationale;
- consequences.

---

## ADR-001 — Backend Owns Ministry State

Status: Accepted

Date: 2026-07-14

### Decision

The backend is the authoritative owner of ministry state.

Commands create canonical events.

Events build projections.

Projections drive pastor-facing experiences.

The dashboard must never independently invent, derive competing business state, or mutate projections directly.

### Rationale

A single backend authority preserves replayability, deterministic behavior, contract consistency, and trust across every ministry workspace.

### Consequences

- Dashboard actions must call verified backend commands.
- Dashboard pages refresh from backend projections after mutations.
- Cross-page disagreements are architecture defects.
- Local dashboard fallback logic must not fabricate healthy or current ministry state.

---

## ADR-002 — Pastoral Notes Are Correctable and Audited

Status: Accepted

Date: 2026-07-14

### Decision

Pastoral notes may be corrected after creation.

Corrections create immutable audit events and update the current projected note without destroying historical versions.

### Rationale

Pastoral staff must be able to correct factual mistakes, spelling errors, or accidental entries while preserving accountability and replay history.

### Consequences

- The current note projection presents corrected text.
- Edited metadata and version history remain available.
- Note history remains replayable.
- Direct destructive row replacement is not permitted.

---

## ADR-003 — Care Ownership Is Event-Sourced

Status: Accepted

Date: 2026-07-14

### Decision

Care assignment and unassignment are represented by canonical `FOLLOWUP_ASSIGNED` and `FOLLOWUP_UNASSIGNED` formation events.

Current ownership is derived through projections.

### Rationale

Ownership affects multiple ministry surfaces and must remain historically auditable, replayable, and deterministic.

### Consequences

- Assignment commands do not mutate projections directly.
- Person 360, Today, Journey, Care, Insights, and Timeline must agree after projection refresh.
- Previous ownership remains visible in history.
- Actor provenance must be preserved.

---

## ADR-004 — Canonical Staff Identity Owns Assignment Identity

Status: Accepted

Date: 2026-07-14

### Decision

Assignment ownership must resolve through the canonical Staff directory.

Technical operator IDs are implementation details and must not be treated as permanent pastor-facing identity.

### Rationale

Ministry leaders need human-readable, administratively managed staff identities without coupling workflows to fixed technical IDs.

### Consequences

- Unknown staff identities are rejected for assignment.
- Inactive staff cannot receive new assignments.
- Historical assignments retain resolvable display identity where possible.
- Dashboard assignment controls consume the canonical Staff directory.

---

## ADR-005 — Orchestration Remains Inactive During Pilot Hardening

Status: Accepted

Date: 2026-07-14

### Decision

Orchestration remains deterministic, read-only, and simulation-oriented during pilot hardening.

No scheduler, autonomous mutation, background persistence loop, or task-writing orchestration may be activated.

### Rationale

Pilot readiness depends on trustworthy ministry state and workflows, not speculative automation.

### Consequences

- Existing simulation and preview contracts remain read-side only.
- New orchestration behavior requires a separate explicit architecture decision.
- Phase 2 automation work remains frozen.

---

## ADR-006 — Documentation Uses Single-Fact Ownership

Status: Accepted

Date: 2026-07-14

### Decision

Every active fact has one authoritative document.

If the same fact must be maintained in multiple active documents, the documentation architecture must be consolidated.

### Rationale

Duplicated status, roadmap, and architecture information creates drift, contradictory guidance, and unnecessary maintenance work.

### Consequences

- `MASTER_PLAN.md` owns strategy.
- `PILOT_READINESS_V2.md` owns current pilot readiness.
- `MINISTRY_STATE_MATRIX.md` owns cross-page ministry-state rules.
- `MORNING_MINISTRY_WORKFLOW.md` owns pastor workflow acceptance.
- `PILOT_READINESS_BOARD.md` owns current execution progress.
- `DECISIONS.md` owns architectural rationale.
- `UPDATE_NOTES.md` and `master-checklist.md` are historical records only.
