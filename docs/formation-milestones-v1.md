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
