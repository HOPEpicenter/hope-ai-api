# HOPE Pilot Readiness v2 — Revision 5

Date: 2026-07-14

Status: Pilot Hardening Phase

## Executive Summary

The HOPE Ministry OS dashboard has transitioned from feature construction to pilot hardening.

Core ministry workflows are implemented over verified backend contracts. Staff Administration, editable pastoral notes, canonical care ownership, actor provenance, and the pastor-facing ministry workspaces are now implemented. The remaining pilot work is architecture validation, cross-page consistency, ministry acceptance, access-boundary approval, and final deployment verification.

## Current Pilot Readiness

| Area | Status | Notes |
| --- | --- | --- |
| Backend contracts | Complete | Verified dashboard contracts in use |
| Today Dashboard | Complete | Pastor-focused ministry command center |
| People 360 | Complete | Unified ministry profile and timeline |
| Journey Workspace | Complete | Ministry story and next-step presentation |
| Care Workspace | Complete | Assignment and outcome workflow |
| Insights | Complete | Ministry readiness worklists |
| Admin Readiness Center | Complete | Contract registry and readiness dashboard |
| Identity Presentation Layer | Complete | Human-friendly person and owner names |
| Ministry Event Language | Complete | Backend event codes translated for pastors |
| Display Language Layer | Complete | Status, risk, and reason labels centralized |
| Canonical Projected Staff Directory | Complete | Dashboard assignment and display consume backend-projected Staff identities |
| Test Record Filtering | Complete | Engineering/test data hidden from key ministry views |
| Visitor CRUD | Complete | Person create/edit workflow in dashboard |
| Editable Notes | Complete | Backend event-sourced audited editing and dashboard correction workflow implemented |
| Staff Identity v1 | Complete | Canonical staff identity abstraction and assignment validation |
| Staff Administration | Complete | Event-sourced Staff Administration is implemented across the backend and dashboard. Canonical Staff Identity powers administration, assignment, and display throughout Ministry OS. |
| Canonical Care Ownership | Complete | Assignment and unassignment now write canonical formation events and update derived ministry projections. |
| Ownership Actor Provenance | Complete | Dashboard care ownership commands send actor identity through the verified backend contract. |
| Cross-Page Consistency | In validation | Ministry State Matrix and morning workflow validation remain before pilot launch. |
| Authentication Hardening | Open pilot gate | Pilot access and sensitive-action boundaries require explicit approval |
| Production Readiness | In progress | Final hardening and validation |

## Architectural Decisions

### Display Layer

Backend contracts remain canonical. The dashboard translates backend implementation language into ministry language.

No backend enum, internal code, or technical ID should be displayed directly to pastors when a ministry-facing display helper exists.

### Staff Identity and Staff Directory

Technical owner IDs are presentation implementation details.

Staff Identity v1 is now the backend identity boundary for care/followup ownership. Existing operator IDs remain backward-compatible, but assignment must resolve through known staff identities before future dashboard or staff administration expansion.

The dashboard resolves owners through a centralized staff directory abstraction. The backend supports a projected, event-sourced Staff directory with administrative create, update, and deactivate commands. Dashboard Staff Administration and assignment workflows now consume the canonical projected Staff directory.

Care assignment and unassignment write canonical `FOLLOWUP_ASSIGNED` and `FOLLOWUP_UNASSIGNED` formation events. Current ownership is derived through projections, and actor provenance is preserved through the command contract.

### Test Records

Pastor-facing workflows should default to real ministry records.

Engineering and regression records remain available for development but are hidden from key ministry workflows by default.

### Pastoral Notes

Current state:

- Team-visible pastoral notes can be created.
- Notes appear in the unified ministry timeline.
- Dashboard note creation posts to the backend note creation endpoint.
- Stable note IDs are generated for pastoral notes.
- Canonical pastoral notes projection derives current note state from immutable engagement events.
- GET /visitors/{visitorId}/notes returns projected notes.
- PATCH /visitors/{visitorId}/notes/{noteId} emits immutable note.updated events.
- Edited metadata, version history, and audit history are preserved through replay.
- Full lifecycle regression covers POST -> GET -> PATCH -> GET.

Dashboard state:

- Dashboard editing consumes the verified backend contracts.
- Dashboard editing supports save and cancel behavior.
- Corrected notes display edited indicators.
- Audit and version history remain preserved through the canonical notes contract.

Architectural decision:

Pastoral notes are not permanently append-only. Staff must be able to correct factual mistakes, spelling errors, and accidental entries while preserving an audit trail.

## Remaining Engineering Work

### Wave 1 — Architecture Baseline

- [x] Dynamic projected Staff directory and administrative commands
- [x] Dashboard Staff Administration workflow
- [x] Editable pastoral-note dashboard workflow
- [x] Canonical event-sourced care assignment and unassignment
- [x] Ownership actor provenance
- [x] Ministry State Matrix created
- [x] Morning Ministry Workflow created
- [x] Pilot Readiness Board created
- [x] Synchronize master planning and checklist documents
- [x] Merge architecture baseline through PR
- [x] Remove the duplicate dashboard staff directory and consume canonical backend Staff identities
- [x] Resolve the visitor snapshot React effect lint blocker

### Wave 2 — Cross-Page Architecture Validation

- Verify person identity consistency.
- Verify care-owner consistency.
- Verify formation-stage and next-step consistency.
- Verify pastoral-note and timeline consistency.
- Verify needs-attention and recommended-action consistency.
- Confirm no dashboard workspace invents ministry state.

### Wave 3 — Pilot Validation

- End-to-end ministry walkthrough
- Ministry acceptance testing
- Ownership and inactive-staff edge-case validation
- Pastoral-note correction validation
- Pilot authentication and authorization decision
- Documentation freeze
- Deployment validation
- Pilot launch

## Engineering Governance

The following rules remain mandatory:

- Backend-first architecture
- PR-only workflow
- PowerShell-only implementation workflow
- Contract-first development
- Documentation synchronized with implementation
- No placeholder ministry data
- Pastor-first presentation language
- Shared display helpers for presentation logic
- Shared abstractions over hard-coded values
- Production behavior must remain deterministic

## Documentation Synchronization Rule

Before starting a new engineering wave, verify the implementation and update pilot documentation so it accurately reflects the current system.

This document should be treated as a planning source of truth for remaining pilot work and should evolve alongside the code rather than lagging behind it.

## Success Criteria

The system will be considered pilot-ready when:

- Required backend contracts are verified.
- Dashboard presentation uses ministry-facing language.
- Engineering/test records are hidden from ministry workflows by default.
- Staff assignment is abstracted from technical IDs.
- Pastoral notes have a backend-backed audited editing path.
- End-to-end ministry workflows pass validation.
- Pilot documentation matches verified implementation.
