# HOPE Ministry OS — Morning Ministry Workflow

Date: 2026-07-14

Status: Pilot Acceptance Workflow

## Purpose

This document defines the primary daily ministry loop that HOPE Ministry OS must support before live pilot launch.

The workflow is successful when a pastor can move from ministry awareness to faithful action without searching multiple pages for conflicting information or interpreting technical system state.

## Primary Morning Loop

Pastor opens HOPE Ministry OS

↓

Today identifies people needing attention

↓

Pastor understands why each person needs attention

↓

Pastor opens Person 360 with work context preserved

↓

Pastor understands identity, story, formation, care, and recent activity

↓

Pastor reviews Journey when spiritual movement or a next step is relevant

↓

Pastor reviews or changes Care ownership when responsibility is relevant

↓

Pastor records contact, outcome, next-step movement, or a pastoral note

↓

Canonical event is written

↓

Backend projections update

↓

Timeline, Journey, Care, Person 360, Today, and Insights agree

↓

Pastor moves to the next person

## Step 1 — Open Today

Today must answer:

1. Who needs attention now?
2. Why do they need attention?
3. Who currently carries responsibility?
4. What is the next faithful action?

### Acceptance Conditions

- Priority comes from verified backend contracts.
- Test records are hidden by default.
- Empty ministry state is distinguishable from backend load failure.
- Each actionable item has a clear person identity.
- Each actionable item has a pastoral reason.
- Each actionable item leads directly to useful person context or action.

## Step 2 — Open Person 360

Person 360 must answer:

1. Who is this person?
2. What is happening in their ministry story?
3. What currently needs attention?
4. Who is walking with them?
5. What happened recently?
6. What should happen next?

### Acceptance Conditions

- The person selected on Today remains selected.
- The reason for opening the person is not lost.
- Identity comes from the canonical visitor projection.
- Current care owner agrees with Today and Care.
- Formation state agrees with Journey.
- Notes and timeline reflect canonical backend history.
- Backend warnings do not masquerade as a healthy or empty record.

## Step 3 — Understand Journey

Journey should interpret spiritual formation movement rather than duplicate the complete timeline.

It must answer:

1. What stage or ministry season is this person in?
2. What meaningful milestones have occurred?
3. What next step has been selected?
4. Has the next step been completed?
5. What faithful movement should happen next?

### Acceptance Conditions

- Stage comes from the formation profile projection.
- Next-step actions write canonical formation events.
- Journey refreshes from backend state after successful commands.
- Person 360 reflects the same stage and next-step truth.
- Journey labels are pastor-facing rather than technical.

## Step 4 — Confirm Care Responsibility

Care must answer:

1. Does this person need active care?
2. Who is responsible?
3. How urgent is the situation?
4. What action is recommended?
5. What outcome has already been recorded?

### Acceptance Conditions

- Assignment choices come from active canonical staff identities.
- Assignment writes a canonical `FOLLOWUP_ASSIGNED` event.
- Unassignment writes a canonical `FOLLOWUP_UNASSIGNED` event.
- Actor provenance is recorded.
- Current ownership refreshes consistently across all workspaces.
- Unassigned people needing care remain visible.
- Inactive staff cannot receive new assignments.

## Step 5 — Record Ministry Action

Supported pilot actions include:

- add or correct a pastoral note;
- assign, reassign, or unassign care ownership;
- mark contact;
- record a care outcome;
- select a journey next step;
- complete a journey next step;
- edit person identity information through verified visitor contracts.

### Acceptance Conditions

- Commands fail clearly when required information is missing.
- Successful commands create canonical events where required.
- No dashboard action directly mutates a projection.
- Repeated event IDs remain idempotent.
- Actor identity is captured for sensitive ministry commands.
- The UI refreshes from backend truth instead of assuming success locally.

## Step 6 — Verify Ministry State Convergence

After an action, the system must converge on one ministry truth.

### Ownership Example

After assignment:

- Today shows the new owner.
- Person 360 shows the new owner.
- Journey shows the new owner when ownership context is displayed.
- Care shows the new owner.
- Insights filters and worklists use the new owner.
- Timeline records the assignment.
- Historical ownership remains auditable.

### Note Correction Example

After correcting a note:

- Person 360 shows the corrected text.
- The note shows an edited indicator.
- Timeline shows the appropriate current or audited representation.
- Version and audit history remain available.
- The original event history remains replayable.

### Care Outcome Example

After recording an outcome:

- Care reflects the new outcome.
- Open-work lists update appropriately.
- Today no longer presents an obsolete action.
- Insights no longer presents a resolved opportunity as open.
- Person 360 and Timeline preserve the ministry history.

## Step 7 — Continue the Ministry Queue

The system should allow the pastor to continue without rebuilding context manually.

### Acceptance Conditions

- Returning to Today reflects refreshed state.
- Resolved people leave open worklists when appropriate.
- Unresolved people remain visible.
- Navigation does not silently select another person.
- Query-string person context remains valid across pages.
- The pastor can identify the next person requiring attention.

## Pilot Walkthrough Scenarios

### Scenario A — New Person to Active Care

1. Create a person.
2. Open Person 360.
3. Add a pastoral note.
4. Assign an active staff owner.
5. Select a journey next step.
6. Record contact.
7. Record a care outcome.
8. Verify all workspaces agree.

### Scenario B — Ownership Transfer

1. Open a currently assigned person.
2. Reassign the person to another active staff member.
3. Verify the new current owner everywhere.
4. Verify the former owner remains in history.
5. Verify the assignment timeline event includes actor provenance.

### Scenario C — Unassigned but Still Needing Care

1. Open a person who needs active care.
2. Unassign the current owner.
3. Verify current ownership clears everywhere.
4. Verify the person remains visible in an unassigned or needs-attention worklist.
5. Assign a new owner and confirm convergence.

### Scenario D — Pastoral Note Correction

1. Add a note containing an intentional error.
2. Edit the note.
3. Save the correction.
4. Verify corrected text and edited indicator.
5. Verify audit history.
6. Verify replay-safe event history remains intact.

### Scenario E — Journey Movement

1. Select a next step.
2. Verify Journey and Person 360 agree.
3. Complete the next step.
4. Verify updated journey state.
5. Verify timeline history.
6. Verify any related opportunity worklist resolves or changes correctly.

### Scenario F — Backend Partial Failure

1. Cause or simulate one noncritical dashboard subload failure.
2. Verify successful ministry data remains visible.
3. Verify a warning is shown.
4. Verify the page does not falsely show an all-clear or empty ministry state.
5. Verify no local fallback invents current ministry state.

## Pilot Exit Standard

The morning workflow is considered pilot-ready when ministry users can complete all required scenarios without developer interpretation and every affected workspace reflects the same verified backend truth.
