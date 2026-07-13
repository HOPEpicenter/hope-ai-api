# HOPE Pilot Readiness v2 — Revision 4

Date: 2026-07-07

Status: Pilot Hardening Phase

## Executive Summary

The HOPE Ministry OS dashboard has transitioned from feature construction to pilot hardening.

Core ministry workflows are implemented over verified backend contracts. Recent work focused on pastor-facing language, shared presentation services, test-record filtering, staff-directory foundation, and verified admin readiness.

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
| Shared Staff Directory | Complete | Central staff display abstraction |
| Test Record Filtering | Complete | Engineering/test data hidden from key ministry views |
| Visitor CRUD | Complete | Person create/edit workflow in dashboard |
| Editable Notes | Complete | Backend event-sourced audited editing implemented |
| Staff Identity v1 | Complete | Canonical staff identity abstraction and assignment validation |
| Staff Administration | Backend Complete | Event-sourced Staff Administration validated locally, through CI, deployed successfully, and verified in staging. Remaining work is dashboard administration UX. |
| Authentication Hardening | Planned | Pilot wave |
| Production Readiness | In progress | Final hardening and validation |

## Architectural Decisions

### Display Layer

Backend contracts remain canonical. The dashboard translates backend implementation language into ministry language.

No backend enum, internal code, or technical ID should be displayed directly to pastors when a ministry-facing display helper exists.

### Staff Identity and Staff Directory

Technical owner IDs are presentation implementation details.

Staff Identity v1 is now the backend identity boundary for care/followup ownership. Existing operator IDs remain backward-compatible, but assignment must resolve through known staff identities before future dashboard or staff administration expansion.

The dashboard resolves owners through a centralized staff directory abstraction. The backend now supports a projected, event-sourced Staff directory with administrative create, update, and deactivate commands. Dashboard staff management and assignment administration remain future presentation work.

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

Remaining dashboard state:

- Dashboard editing should consume the verified backend contracts.
- Dashboard should show save/cancel editing, edited indicators, and audit/history display.

Architectural decision:

Pastoral notes are not permanently append-only. Staff must be able to correct factual mistakes, spelling errors, and accidental entries while preserving an audit trail.

## Remaining Engineering Work

### Wave 1 — Backend Completion

- [x] Dynamic projected Staff directory API built on Staff Identity v1
- [x] Staff create, update, and deactivate command API
- [x] Interim administrative API-key boundary for staff mutations
- [x] Local Azure Functions lifecycle validation
- [x] CI verification
- [x] Staging administrative-key configuration and lifecycle validation
- [ ] Broader authentication and authorization hardening

### Wave 2 — Dashboard Completion

- Edit pastoral note UI
- Save/cancel note editing flow
- Edited badge or audit indicator
- Staff management UI
- Staff assignment administration
- Final workflow polish

### Wave 3 — Pilot Validation

- End-to-end ministry walkthrough
- Ministry acceptance testing
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
