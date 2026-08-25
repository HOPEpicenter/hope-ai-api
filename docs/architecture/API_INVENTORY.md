# API Inventory Summary

This is a high-level inventory derived from PR history. Use code inspection for exact handler names before editing.

## Product API Families

| Family | Status | Notes |
|---|---|---|
| `/visitors` | Complete | Create/read/list/update identity. Phone/address/birthday supported. |
| `/visitors/{id}/notes` | Complete | Emits existing `note.add` engagement event. |
| `/visitors/{id}/dashboard-card` | Complete | Enriched canonical dashboard card including the current backend-owned visitor `displayName`; production TC-13 and required CI regression verified. |
| `/formation/events` | Complete | Formation V1 event ingestion with actor attribution guardrails. |
| `/formation/profile` | Complete | Canonical formation profile projection. |
| `/integration/timeline/global` | Complete | Unified story/timeline route with parity history. |
| `/care/candidates` | Complete | List/detail/filter/sort projection. |
| `/care/summary` | Complete | Summary rollups and filter parity. |
| `/care/export` | Complete | JSON export read model. |
| `/care/candidates/{id}/assign` | Complete | Care ownership command. |
| `/care/candidates/{id}/unassign` | Complete | Care ownership command. |
| `/care/candidates/assign-bulk` | Complete | Bulk care assignment. |
| `/care/candidates/unassign-bulk` | Complete | Bulk care unassignment. |
| `/activity-intelligence` | Complete | Ministry intelligence composition endpoint. |
| `GET /staff-identities` | Complete | Canonical Staff Identity directory projected from seeded identities and immutable Staff events. |
| `GET /staff-identities/entra/{entraTenantId}/{entraObjectId}` | Complete | Protected canonical Staff Identity lookup by Entra binding. |
| `GET /staff-identities/{staffId}/audit` | Complete | Administrator-only, event-backed Staff administration history with sanitized Entra binding changes. |
| `POST /staff-identities` | Complete | Creates dynamic Staff identities through `staff.created`; requires an active configured canonical administrator. |
| `PATCH /staff-identities/{staffId}` | Complete | Updates, rebinds, deactivates, or reactivates Staff identities through immutable events; requires an active configured canonical administrator. |
| `POST /visitors/{id}/six-week-followup` | Locally verified | Starts one consent-gated six-week staff follow-up plan per visitor. |
| `GET /visitors/{id}/six-week-followup` | Locally verified | Reads the canonical plan and its six deterministic staff tasks. |
| `GET /six-week-followups` | Locally verified | Lists active/paused plans as a staff work queue; due state is derived at read time. |
| `POST /visitors/{id}/six-week-followup/owner` | Locally verified | Assigns or reassigns an active canonical Staff owner. |
| `POST /visitors/{id}/six-week-followup/tasks/{weekNumber}/outcome` | Locally verified | Records one completed or skipped outcome for a weekly staff task. |
| `POST /visitors/{id}/six-week-followup/status` | Locally verified | Pauses, resumes, or cancels the plan with audited actor attribution. |
| Opportunity worklists | Complete | Segment worklists, action reasons, resolution metadata, narrative. |
| Protected ping / route parity | Complete | Express/Azure parity hardened. |

## OPS / Admin Families

| Family | Status | Notes |
|---|---|---|
| OPS followups | Complete | Queue/read model and projection integrity. |
| OPS task preview summary | Complete | Lightweight dashboard-facing operational preview. |
| OPS task preview simulation | Complete/OPS-only | Read-only diagnostics; no orchestration activation. |
| OPS teams registry | Complete v1 | Read-only registry for team owner references. |
| Runtime route inventory | Complete | Documented and guarded by assertion. |
