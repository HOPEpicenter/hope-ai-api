# Formation milestones v1 (contract)

## Purpose
Define the v1 set of formation milestone event types and the derivation rules that produce a formation profile snapshot.

## Event envelope (v1)
All formation events use the v1 envelope:
- v
- eventId
- visitorId
- type
- occurredAt
- source
- data

## Event types (v1)

### NEXT_STEP_SELECTED
Required:
- data.nextStep (string)

Derivations (v1 intent):
- profile.lastNextStepAt := occurredAt
- profile.stage := Connected (if not already)

### FOLLOWUP_ASSIGNED
Required:
- data.assigneeId (string)

Derivations (v1 intent):
- profile.assignedTo := data.assigneeId
- profile.lastFollowupAssignedAt := occurredAt
- profile.stage := Connected (if not already)

## Profile snapshot fields (v1)
At minimum, profile includes:
- visitorId
- stage
- assignedTo (nullable)
- lastEventType / lastEventAt
- updatedAt

(Additional touchpoint timestamps may be present, e.g. lastNextStepAt, lastFollowupAssignedAt, etc.)

## Query surfaces that must remain stable
- GET /api/visitors/:id/formation/profile
- GET /api/formation/profiles?visitorId=...
- GET /api/formation/profiles?stage=Connected
- GET /api/formation/profiles?assignedTo=...

## Non-goals
- No new business logic beyond codifying current behavior.
- No new stages without explicit plan update.


## HTTP contract details (v1)

### POST /api/formation/events
Consumes a v1 event envelope (see “Event envelope (v1)”).
Notes:
- v1 is the canonical contract for Phase 3 (legacy may be accepted for backward compatibility).
- `eventId` is the idempotency key for events.
- Response must preserve existing contract fields used by asserts (`ok`, and an id field when provided).

### GET /api/visitors/:id/formation/events
Paging:
- `limit` (int, default 50)
- `cursor` (string; returned from prior response; means “fetch older-than this cursor”)
Response:
- `ok` (boolean)
- `visitorId` (string)
- `items` (array; newest-first)
- `cursor` or `nextCursor` (string|null; omitted/null when exhausted)

Deep paging test:
- `scripts/assert-formation-pagination.ps1` with `HOPE_RUN_PHASE3_DEEP_PAGING=1` validates cursor progression + dedupe across pages.
