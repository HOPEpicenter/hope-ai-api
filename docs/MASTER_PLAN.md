# HOPE AI — MASTER PLAN

## 2026-03-12 Update

**What landed**
- ✅ **#300**: Followups dashboard now shows active filter chips and a clear-all control.
- ✅ **#301**: Followups aging summary cards (24h+/48h+/72h+) are now clickable presets.

**Why this matters (master plan alignment)**
- Improves operator speed and queue visibility without widening backend/API scope.
- Keeps this work on the OPS/dashboard usability side while preserving `/api/*` as the product surface.

**Next**
- Continue small followups dashboard usability slices only if they stay production-safe and clearly improve operator workflow.
- Do not reopen backend scope here unless a real workflow blocker appears.
## 2026-03-07 Update

**What landed**
- ✅ **#245**: integration summary follow-up invariants (no-false-followup + late/older summary hardening).
- ✅ **#246**: assignment-only integration summary source-flag invariant.
- ✅ **#247**: assignment-only → assignment+engagement source transition invariant.
- ✅ **#248**: formation snapshot same-timestamp tie-break invariant.
- ✅ **#249**: formation idempotency assert is now wired into the default regression runner.

**Why this matters (master plan alignment)**
- Tightens backend contract coverage without widening product scope.
- Reduces deadline risk by moving high-value integration/formation invariants into the default regression path.
- Keeps the current Phase 3/4 surface deterministic while avoiding speculative new workflow logic.

**Next**
- Do docs + staging closeout.
- Only add another backend slice if staging exposes a real blocker or a clearly missing repeated-event/profile-invariant gap.
## 2026-03-06 Update

**What landed**
- ✅ Fixed classic Functions auth parity for `POST /api/formation/events` by changing the HTTP output binding from `"$return"` to `"res"` (PR #227).
- ✅ Verified staging behavior: unauthenticated `POST /api/formation/events` now returns `401`.
- ✅ `scripts/assert-auth-scoping.ps1` passes on staging.
- ✅ `scripts/regression.ps1` passes end-to-end on staging.

**Why this matters (master plan alignment)**
- Keeps protected `/api/*` behavior contract-correct without broad refactors.
- Removes a real deployment/runtime parity issue that would have caused false confidence from source/package parity while staging still behaved incorrectly.

**Next**
- Keep docs/checklists aligned with actual protected surface behavior.
- Return focus to the next backend contract slice; do not reopen this area unless behavior regresses.

## Completed (2026-02-28)

- Visitors: GET /api/visitors list endpoint shipped (#165)
- Visitors: deterministic list ordering (updatedAt desc) shipped (#167)
- Visitors: removed duplicate email reservation block shipped (#166)
- CI: auth scoping expectations (assert-auth-scoping.ps1) run in CI via ci-run-express-smoke

## 2026-02-27 Update

**What landed**
- ✅ OPS followups queue: ensure formation profiles table exists before listing (fresh Azurite/Azurite resets don’t 500).
- ✅ OPS followups queue: include esolvedForAssignment in response items (queue consumers can decide what to hide).

**Why this matters (master plan alignment)**
- Keeps /ops/* as dev/admin tooling while preserving write discipline via /api/* (OPS reads projections; writes remain formation events).
- Reduces “major problems later” risk: fewer flaky/local-first failures caused by missing dev tables.

**Next**
- Add/refresh a smoke/regression check that exercises /ops/followups against a fresh Azurite (empty tables) and after recording a followup assignment/outcome.
- Stay focused on master plan milestones; avoid broad refactors unless blocked.

## 2026-02-25 Update

**What landed**
- ✅ **#139**: regression runner now asserts integration summary followupReason/assignedTo consistency (only when HOPE_API_KEY is set).
- ✅ **#140**: CI uses HOPE_API_KEY secret with safe fallback so CI stays green until secrets are configured.
- ✅ **#141**: ensureTableExists made race-tolerant for Azurite/CI (already-exists treated as OK).
- 🧹 Closed stale/bundled CI PRs (#2–#5) to avoid merging risky YAML bundles.

**Why this matters (master plan alignment)**
- Keeps CI green and reduces Azurite flake, without expanding scope beyond “major-problems-later” fixes.
- Keeps regression contracts tightening around API behavior while remaining gated for local-only secrets.

**Next**
- Stay on the master plan: focus on the next API surface milestones; avoid bundling CI refactors unless a real block appears.

This document tracks the *public-ish* API surface under /api/* and dev/admin tooling under /ops/*.


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
- [x] POST `/api/formation/events` (protected via API key)
- [x] GET `/api/visitors/:id/formation/events` (paging supported)
- [x] GET `/api/visitors/:id/formation/profile` (derived snapshot)
- [x] CI asserts formation pagination + idempotency + profile snapshot behavior

Remaining:
- [ ] Expand milestones v1 beyond the initial two types (if/when needed)
- [ ] Expand regression coverage: repeated events + profile invariants per milestone type (ordering/tie-break + idempotency now covered)
- [x] Clarified/documented that `stageUpdatedAt / stageReason / stageUpdatedBy` are guaranteed for explicit stage-change scenarios, not generic profile outputs

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
- [x] POST `/api/formation/events` requires API key
- [x] Without API key => 401
- [x] With API key but missing required query/invalid body => 400
- [x] Auth scoping verified: public endpoints remain unaffected
- [x] CI/local auth scoping assertions cover 401/400 expectations for scoped endpoints

Remaining:
- [ ] Expand scoped endpoint coverage only when new protected surfaces are added

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
- [x] Regression covers integration summary ownership/source invariants (follow-up consistency, assignment-only source flags, assignment→engagement transition, no-false-followup, late/older-event stability)

Remaining:
- [x] Define cross-stream ordering contract (explicitly documented) (docs/integration-ordering-contract-v1.md)
- [x] Define aggregation model (engagement + formation merge rules) (docs/integration-aggregation-model-v1.md)
- [x] Model ownership / follow-up assignments (docs/ownership-followup-model-v1.md)
- [x] Connect people to groups / programs / workflows (docs/groups-programs-workflows-model-v1.md)
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

1. Close docs and staging verification for the current Phase 3/4 surface.
2. Only add another Formation slice if a real repeated-event/profile-invariant gap is found.
3. Implement additional Integration business logic only if a real producer or blocker requires it.


## Deployment notes
- Staging deploy packaging: Oryx/build is disabled; the staged .deploy zip must be self-contained and include production dependencies (npm ci --omit=dev inside .deploy). (PR #197)
## 2026-03-10 closeout

Dashboard foundation is now complete on main:
- visitors list wired to real API
- visitor detail wired to real visitor endpoints
- overview wired to real dashboard loaders
- shell layout polish with sidebar navigation
- shared loading / empty / error page states

Dashboard usability follow-up slices also landed:
- relative timestamps across visitors, visitor detail, followups, and timeline
- freshness-oriented sorting for visitors, followups, and timeline
- clearer empty-state messaging
- dashboard copy and label polish across shell and table surfaces

Formation docs clarification also landed:
- `stageUpdatedAt / stageUpdatedBy / stageReason` are documented as stage-change metadata, not generic profile outputs

Next planned slice:
- UI-only dashboard usability improvements
- do not reopen backend scope unless a real blocker appears

