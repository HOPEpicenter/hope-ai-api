# OPS Followups Consumer Contract v1

Scope:
- Dev/admin tooling surface: `/ops/followups`
- Purpose: define how the current followups queue is intended to be consumed during the current delivery window
- Non-goal: add new backend behavior

## Consumer
Primary consumer:
- operations/admin followup queue user

Core job:
- see which assigned visitors still need followup attention
- understand whether a row is still actionable for the current assignment
- avoid treating resolved rows as active work

## Current queue semantics
`/ops/followups` is a read/projection surface.
Writes remain in formation events under `/api/formation/events`.

Rows are included only when:
- `assignedTo` exists
- the assignment is not resolved by a later/same-time outcome for that assignment

Current response fields include:
- `visitorId`
- `assignedTo`
- `lastFollowupAssignedAt`
- `lastFollowupContactedAt`
- `lastFollowupOutcomeAt`
- `resolvedForAssignment`
- `stage`
- `needsFollowup`

## Consumer decisions supported now
The current queue supports these decisions:

1. Is this visitor currently assigned to someone?
- use `assignedTo.ownerId`

2. Does this row still need followup attention?
- use `needsFollowup`

3. Has this assignment already been resolved?
- use `resolvedForAssignment`
- queue view is expected to omit resolved rows

4. What is the latest followup timing context?
- use `lastFollowupAssignedAt`
- use `lastFollowupContactedAt`
- use `lastFollowupOutcomeAt`

5. What formation stage is the visitor currently in?
- use `stage`

## Required consumer assumptions (v1)
- `/ops/followups` is operational/read-only
- absence from queue after an outcome means “resolved for current assignment”
- `assignedTo` is the ownership signal for queue accountability
- `needsFollowup` is the actionability signal for queue handling
- queue semantics must remain additive and should not require timeline cursor changes

## Out of scope for v1
- SLA timers
- reminders/escalations
- multi-assignee routing
- permissions/ACL policy
- group/program/workflow-driven queue logic
- journey-step workflow expansion

## Follow-on questions (only if a real consumer needs them)
- Does the queue need display-oriented visitor metadata beyond `visitorId`?
- Does the queue need filtering/sorting rules documented explicitly?
- Does the queue need a documented “resolved but still visible” mode, or is omission sufficient?
- Do groups/programs/workflows need to appear here at all, or only in integration summary?

## Decision
For the current deadline window:
- freeze queue behavior unless a real operator-facing blocker appears
- prefer docs/consumer clarification over new backend scope