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

---

## Phase 2 — ENGAGEMENT (COMPLETED)

Status: ✅ COMPLETE

Checklist:
- [x] Engagement Event Envelope v1 (validation + strict contract)
- [x] POST `/api/engagements/events` accepts engagement events (envelope)
- [x] GET `/api/engagements/timeline` supports cursor paging (`nextCursor`) and stable ordering
- [x] GET `/api/engagements/status` returns current status derived from events
- [x] Notes + tags supported as first-class engagement event types
- [x] GET `/api/engagements/score` exists and returns `{ ok: true, ... }`

Locked:
- Phase 2 is production-ready and should not be reworked unless it prevents major problems later.

---

## Phase 3 — AUTH-SCOPING (STUB SURFACES ONLY)

Status: ✅ COMPLETE (stubs only)

Goal:
- Keep public endpoints unaffected.
- Add protected endpoints as *stubs* only:
  - No API key => 401
  - With API key but missing required query => 400
  - (No real business logic required yet.)

Checklist:
- [x] GET `/api/formation/timeline` is protected (scoped) and returns 400 if query invalid/missing
- [x] GET `/api/integration/timeline` is protected (scoped) and returns 400 if query invalid/missing
- [x] GET `/api/legacy/export` is protected (scoped) and returns 400 if query invalid/missing
- [x] Auth scoping verified: public endpoints remain unaffected

Next (later phases):
- [ ] Implement integration timeline aggregation logic (beyond stubs)
- [ ] Implement legacy export payload + streaming / export format
- [ ] Add CI coverage for Phase 3 auth expectations

