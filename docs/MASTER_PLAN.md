# HOPE AI — MASTER PLAN

This document tracks the *public-ish* API surface under `/api/*` and dev/admin tooling under `/ops/*`.

---

## Phase 1 — IDENTITY (COMPLETED)

Status: ✅ COMPLETE

Checklist:
- [x] Create Visitor endpoint exists and returns `visitorId`
- [x] Storage-backed visitor persistence wired (Azure Tables via repo)
- [x] API key middleware exists (`x-api-key`) and is used for protected surfaces (scoped)
- [x] Basic health endpoint for CI smoke (`/api/health`)

Notes:
- Phase 1 is locked unless a change prevents major problems later.
- Idempotent visitor creation and stale EMAIL index repair are covered by smoke.

---

## Phase 2 — ENGAGEMENT (COMPLETED / LOCKED)

Status: ✅ COMPLETE

Checklist:
- [x] Engagement Event Envelope v1 (validation + strict contract)
- [x] POST `/api/engagements/events` accepts engagement events (envelope)
- [x] GET `/api/engagements/timeline` supports cursor paging (`nextCursor`) and stable ordering
- [x] Timeline contract hardened:
  - limit=1 no skip / no overlap regression
  - cross-stream cursor boundary regression
  - cursor is URL-safe and round-trips via URL escaping
- [x] GET `/api/engagements/status` returns current status derived from events
- [x] Notes + tags supported as first-class engagement event types
- [x] GET `/api/engagements/score` exists and returns `{ ok: true, ... }`
- [x] Oversized metadata returns 400
- [x] 404 JSON includes `requestId`

Locked:
- Phase 2 is production-ready and should not be reworked unless it prevents major problems later.
- Paging + cursor logic is hardened and should not be revisited without a major contract change.

---

## Phase 3 — FORMATION (ACTIVE / PARTIALLY COMPLETE)

Status: 🟡 ACTIVE

Implemented:
- [x] Formation stage model exists in contract (FormationStage + stage fields on profile snapshot)
- [x] POST `/api/formation/events`
- [x] GET `/api/visitors/:id/formation/events` (paging supported)
- [x] GET `/api/visitors/:id/formation/profile` (derived snapshot)
- [x] CI asserts formation pagination + idempotency + profile snapshot behavior

Remaining:
- [ ] Expand milestones v1 beyond the initial two types (if/when needed)
- [ ] Expand regression coverage: ordering/tie-break scenarios, repeated events, idempotency + profile invariants per milestone type
- [ ] Decide whether “stageUpdatedAt / stageReason / stageUpdatedBy” become enforced derivation outputs (or remain optional fields)

Notes:
- Formation should follow the same event-driven derivation discipline as Engagement.
- Prefer deriving state from events rather than storing derived fields.

---

## Cross-cutting — AUTH SCOPING (COMPLETED, STUB SURFACES ONLY)

Status: ✅ COMPLETE (stub behavior only)

Goal:
- Public endpoints remain unaffected.
- Protected endpoints enforce API key and required query validation.
- No real business logic required yet.

Implemented:
- [x] GET `/api/formation/timeline` requires API key
- [x] GET `/api/integration/timeline` requires API key
- [x] GET `/api/legacy/export` requires API key
- [x] Without API key => 401
- [x] With API key but missing required query => 400
- [x] Auth scoping verified: public endpoints remain unaffected

Remaining:
- [ ] Ensure CI explicitly asserts 401/400 expectations for all scoped endpoints

---

## Phase 4 — INTEGRATION (ACTIVE / PARTIALLY COMPLETE)

Status: 🟡 ACTIVE (timeline + cursor contract implemented; more business logic pending)

Implemented:
- [x] GET `/api/integration/timeline` v1 aggregation + cursor paging (protected)
- [x] Cursor contract exists (`integrationTimelineCursor.v1` base64url JSON round-trip)
- [x] Deep paging + cursor translation hardened at integration layer
- [x] Cross-stream cursor boundary regression coverage exists
- [x] GET `/api/integration/summary` v1 (read-only derived view)
- [x] Gated assert script exists (`scripts/assert-integration-summary.ps1`)
- [x] Consistency hardening: integration timeline reads formation via storage repo (cursor decode + perStream+1 tail slice paging)

Remaining:
- [x] Define cross-stream ordering contract (explicitly documented) (docs/integration-ordering-contract-v1.md)
- [x] Define aggregation model (engagement + formation merge rules) (docs/integration-aggregation-model-v1.md)
- [x] Model ownership / follow-up assignments (docs/ownership-followup-model-v1.md)
- [ ] Connect people to groups / programs / workflows

Notes:
- Integration must preserve stable ordering guarantees from Phase 2.
- Aggregation must not break cursor contract.

---

## Phase 5 — LEGACY (NOT STARTED)

Status: ⚪ NOT STARTED

Planned:
- [ ] Implement legacy export payload
- [ ] Streaming / export format
- [ ] Long-horizon history views
- [ ] Derived insights (avoid storing derived state unless necessary)

---

## Guardrails (Always)

- Keep smoke green and CI green.
- No direct pushes to `main`; PRs only.
- Only ship changes that:
  - Prevent major future problems, or
  - Advance the master plan deliberately.
- Keep `/ops/*` as dev/admin tooling only.
- Treat `/api/*` as the product surface and contract.

---

## Next Focus (Priority Order)

1. Lock Formation milestone model (small, safe PR-sized work).
2. Implement Integration aggregation logic (incremental, contract-first).
3. Add CI coverage for scoped auth expectations if not already fully asserted.

