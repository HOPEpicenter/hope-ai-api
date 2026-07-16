# API Inventory Summary

This is a high-level inventory derived from PR history. Use code inspection for exact handler names before editing.

## Product API Families

| Family | Status | Notes |
|---|---|---|
| `/visitors` | Complete | Create/read/list/update identity. Phone/address/birthday supported. |
| `/visitors/{id}/notes` | Complete | POST creates `note.add`; GET returns the canonical projected note state; PATCH `/visitors/{id}/notes/{noteId}` emits immutable `note.updated` events with version and audit history. |
| `/visitors/{id}/dashboard-card` | Complete | Enriched canonical dashboard card. |
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
| `GET /staff-identities` | Complete | Canonical Staff Identity directory projected only from immutable Staff events; compatibility-only legacy IDs are excluded from canonical projections. |
| `POST /staff-identities` | Complete | Creates dynamic Staff identities through `staff.created`; protected by the administrative API-key boundary and verified through CI and staging lifecycle assertions. |
| `PATCH /staff-identities/{staffId}` | Complete | Updates or deactivates Staff identities through immutable `staff.updated` and `staff.deactivated` events; verified through CI and staging lifecycle assertions. |
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
