# Followup Outcome Semantics v2

## Purpose

Define the required followup outcome semantics discovered during pilot tabletop validation.

Core decision:

A no response is an attempt outcome, not a terminal outcome.

## Current State

The current backend treats any FOLLOWUP_OUTCOME_RECORDED event as terminal for the active followup assignment.

Current behavior:

FOLLOWUP_OUTCOME_RECORDED
-> lastFollowupOutcomeAt populated
-> followupResolved = true
-> resolvedForAssignment = true
-> visitor removed from active Ready Care / followups queue

This works for truly terminal outcomes, but it is incorrect for non-contact or continued-care outcomes.

## Pilot Finding

A no response is not a successful connection and should not close the care loop.

It is also not a failure. It is an attempted outreach step that did not connect.

The current behavior can cause a visitor to leave Ready Care even though another care attempt is still needed.

## Required Semantics

Followup activity should distinguish between:

- contact attempts
- terminal outcomes
- continued-care outcomes
- correction/reopen activity

## Outcome Categories

### Terminal Outcomes

These may close the active followup assignment:

- connected
- closed

Expected behavior:

terminal outcome recorded
-> followup resolved for current assignment
-> removed from active queue
-> retained in history/timeline

### Non-Terminal Attempt Outcomes

These must not close the active followup assignment:

- no_response
- left_message

Expected behavior:

attempt recorded
-> followup remains open/actionable
-> history/timeline preserved
-> task engine schedules next step

### Continued-Care Outcomes

These must not close the active followup assignment unless an explicit terminal outcome is also recorded:

- needs_care

Expected behavior:

continued care recorded
-> followup remains open or escalates
-> task engine creates/recommends next action

## Desired No Response Flow

A no-response attempt should preserve attempt history.

Suggested fields:

- attempted_at
- attempt_method
- attempt_outcome: NO_RESPONSE
- notes

Example progression:

- First attempt -> no response -> create new task in 3 days
- Second attempt -> no response -> escalate to Needs Pastoral Review
- Third attempt -> no response -> move to Dormant but not closed with 30-day check-in

## Correction Requirements

The system must eventually support:

- undo last outcome
- reopen followup
- merge new activity into the existing chain

These capabilities are required to keep history intact and avoid duplicate followups.

## Implementation Direction

Do not treat every FOLLOWUP_OUTCOME_RECORDED event as resolved.

Resolution should depend on the outcome category.

## Possible Implementation Options

### Option A: Pilot-safe minimal change

Map no-response and left-message activity to contact/attempt semantics rather than terminal outcome semantics.

Example:

FOLLOWUP_CONTACTED
method = call | text | email | in_person
result = no_answer | left_message

Pros:

- uses existing event type
- keeps active followup open
- lower implementation risk

Cons:

- contact attempt semantics remain overloaded
- less explicit than a dedicated attempt event

### Option B: Cleaner long-term event model

Add a dedicated event:

FOLLOWUP_ATTEMPT_RECORDED

with:

- attemptMethod
- attemptOutcome
- attemptedAt
- notes

Pros:

- clearer domain model
- better task-engine foundation
- separates attempts from outcomes cleanly

Cons:

- expands event contract
- requires broader regression and dashboard updates

## Follow Up Task Engine Direction

The task engine should eventually consume attempt history and produce next actions.

Example rules:

- attempt 1 + NO_RESPONSE -> next attempt due in 3 days
- attempt 2 + NO_RESPONSE -> Needs Pastoral Review
- attempt 3 + NO_RESPONSE -> Dormant but not closed; 30-day check-in

## Pilot Recommendation

For pilot safety:

1. Do not close followups on no_response.
2. Do not close followups on left_message.
3. Do not close followups on needs_care.
4. Preserve all attempt history.
5. Add correction/reopen design before broader rollout.

## Non-Goals For This Design PR

This document does not implement:

- backend semantic changes
- dashboard mutation changes
- task engine scheduling
- undo/reopen workflows
- migration/backfill of existing pilot records

Those should be implemented in follow-up PRs after this semantic direction is accepted.
