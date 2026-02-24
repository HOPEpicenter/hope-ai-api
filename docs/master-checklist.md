# HOPE AI API Master Checklist (Product + Engineering)

> Single source of truth for what’s built, what’s locked, and what’s next.
> Update this file in the same PR as any change that materially affects behavior or contracts.

## Current state

- Repo status: merge to `main` via PR only; keep CI green.
- This checklist is implementation-focused; `docs/MASTER_PLAN.md` is the phase truth source.
- After any behavior/contract change: update BOTH this file and `docs/MASTER_PLAN.md`.

---

## Phase 1 — Identity (LOCKED / COMPLETE)

### Product outcomes
- [x] Canonical visitorId as the stable identifier for a person.
- [x] Visitor creation is idempotent by normalized email (trim + lowercase).

### Engineering / contracts
- [x] Public create visitor: POST /api/visitors
  - Returns 201 when created; 200 when reused (idempotent repeat).
  - Always returns { ok: true, visitorId } on success.
- [x] Public get visitor: GET /api/visitors/:id
- [x] Validation: missing email => 400; invalid email => 400.

### Storage invariants (Azure Table Storage)
- [x] VISITOR entity: PartitionKey="VISITOR", RowKey=visitorId
- [x] EMAIL index entity: PartitionKey="EMAIL", RowKey=encodeURIComponent(eemailLower) => { visitorId }
- [x] Stale EMAIL index repair:
  - If EMAIL index points to missing visitor, recover VISITOR by emailLower, repair index, return existing visitor.

### Tests
- [x] Smoke coverage:
  - [x] Public create idempotency (same email returns same visitorId)
  - [x] Stale EMAIL index regression (corrupt index -> API repairs -> returns same visitorId)
  - [x] Public get visitor
  - [x] Public create missing email => 400

### Change log / references
- [x] PR #68 merged: stale EMAIL index delete+retry + docs for 200/201 behavior
- [x] PR #69 merged: recover-by-eemailLower + smoke regression for stale EMAIL index

---

## Phase 2 — Engagement (LOCKED / COMPLETE)

### Product outcomes
- [x] Engagement events are stable-contract and ministry-safe (envelope locked).
- [x] Timeline read contract is stable (cursor paging + ordering).
- [x] Status transitions are auditable (event-driven preferred).
- [x] Notes + tags v1 (ministry-friendly).
- [x] Engagement score (derived, not stored).
### Engineering (already present / verified by smoke)
- [x] Public engagement append works: POST /api/engagements/events
- [x] Public engagement timeline works: GET /api/engagements/timeline
- [x] Public engagement score works: GET /api/engagements/score
- [x] Public engagement status works: GET /api/engagements/status
- [x] Append event endpoint exists and works: POST /ops/visitors/:id/events
- [x] Dashboard endpoint exists and works: GET /ops/visitors/:id/dashboard
- [x] Timeline paging works (nextCursor + page2).
- [x] Oversized metadata protection returns 400.
- [x] 404 JSON includes requestId (verified in smoke).

### Phase 2 — Next PR-sized tasks (choose 1 at a time)
- [x] Lock “Engagement event envelope v1” in one place (validate + normalize consistently).
- [x] Lock “Timeline read contract v1” (cursor paging, stable ordering, consistent limits).
- [x] Model “Status transitions v1” as events (preferred) or dedicated stream.

---

## Phase 3 — Formation (ACTIVE / PARTIALLY COMPLETE)
- [x] Milestone derivation regression assert exists (scripts/assert-formation-milestones-v1.ps1)
- [x] Formation stage model contract exists (FormationStage + stage fields on profile snapshot)
- [x] Public formation append works: POST /api/formation/events
- [x] Public formation list works (paging): GET /api/visitors/:id/formation/events
- [x] Public formation profile snapshot works: GET /api/visitors/:id/formation/profile
- [x] CI asserts cover formation pagination + idempotency + profile snapshot
- [x] Define formation milestones/events and derivations (docs/formation-milestones-v1.md + assert script)
- [ ] Track journey steps in an auditable way (prefer derive from events).
## Cross-cutting — Auth scoping (COMPLETED, stub surfaces only)

- Protected endpoints are enforced via API key middleware:
  - `/api/formation/timeline`
  - `/api/integration/timeline`
  - `/api/legacy/export`
- Expected behavior (stubs only):
  - No API key => 401
  - With API key but missing required query => 400
- Remaining:
  - Add/verify CI assertions for 401/400 expectations for all scoped endpoints.

---

## Phase 4 — Integration (ACTIVE / PARTIALLY COMPLETE)

- [x] `/api/integration/timeline` v1 aggregation exists (protected)
- [x] Cursor contract exists (`integrationTimelineCursor.v1` base64url JSON round-trip)
- [x] Deep paging + cursor translation hardened at integration layer
- [x] Cross-stream cursor boundary regression coverage exists
- [x] `/api/integration/summary` v1 exists (read-only derived view)
- [x] Gated assert exists for integration summary (`scripts/assert-integration-summary.ps1`)
- [x] Consistency hardening: integration timeline reads formation via storage repo (cursor decode + perStream+1 tail slice paging)

Remaining (business logic expansion):
- [ ] Define cross-stream ordering contract (explicitly documented)
- [ ] Define aggregation model (engagement + formation merge rules)
- [ ] Model ownership / follow-up assignments
- [ ] Connect people to groups / programs / workflows

---
## Phase 5 — Legacy (NOT STARTED)
- [ ] Long-horizon outcomes and history views.
- [ ] Derived insights (avoid storing derived state unless necessary).

---

## Guardrails (always)
- Keep smoke green and CI green.
- No direct pushes to main; PRs only.
- Focus: only changes that prevent major issues later or advance the master plan.


