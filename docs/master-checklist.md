# HOPE AI API Master Checklist (Product + Engineering)

> Single source of truth for what’s built, what’s locked, and what’s next.
> Update this file in the same PR as any change that materially affects behavior or contracts.

## Current state (as of aeb8c67)

- Repo status: main is green locally (smoke passes) and merges only via PR with CI.
- Last known merge on main: 60eb9ac

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

## Phase 2 — Engagement (ACTIVE / PARTIALLY COMPLETE)

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

## Phase 3 — Formation (NOT STARTED)
- [ ] Define formation milestones/events and derivations.
- [ ] Track journey steps in an auditable way (prefer derive from events).

## Phase 4 — Integration (NOT STARTED)
- [ ] Connect people to groups/programs/workflows.
- [ ] Ownership / follow-up assignments.

## Phase 5 — Legacy (NOT STARTED)
- [ ] Long-horizon outcomes and history views.
- [ ] Derived insights (avoid storing derived state unless necessary).

---

## Guardrails (always)
- Keep smoke green and CI green.
- No direct pushes to main; PRs only.
- Focus: only changes that prevent major issues later or advance the master plan.

