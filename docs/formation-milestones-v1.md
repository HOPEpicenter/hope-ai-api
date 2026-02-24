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

Derivations:
- profile.nextStep := data.nextStep
- profile.stage := Connected (if not already)

### FOLLOWUP_ASSIGNED
Required:
- data.assigneeId (string)

Derivations:
- profile.assignedTo := data.assigneeId
- profile.stage := Connected (if not already)

## Profile fields (v1)
- visitorId (string)
- stage (string)  # currently queried as Connected
- assignedTo (string|null)
- nextStep (string|null)

## Query surfaces that must remain stable
- GET /api/visitors/:id/formation/profile
- GET /api/formation/profiles?visitorId=...
- GET /api/formation/profiles?stage=Connected
- GET /api/formation/profiles?assignedTo=...

## Non-goals
- No new business logic beyond codifying current behavior.
- No new stages without explicit plan update.
