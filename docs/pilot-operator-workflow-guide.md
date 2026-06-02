# Pilot Operator Workflow Guide

## Purpose

This guide explains the pilot operator workflow for using the HOPE Today cockpit during a controlled pilot.

## Primary Workflow

Ready Care
  -> Open Visitor
  -> Mark Contacted
  -> Record Outcome
  -> Resolved

## Daily Startup

1. Confirm the dashboard loads.
2. Confirm the Today cockpit is visible.
3. Confirm Ready Care cards are present or the empty state is shown.
4. Confirm the operator has the current dashboard access token.
5. Confirm any known latency or staging issues from the previous pilot session.

## Processing Ready Care

1. Review the visitor name and context.
2. Open the visitor detail view.
3. Review available Formation, Engagement, and followup context.
4. Decide whether contact is appropriate.
5. Avoid changing state if the visitor record appears incorrect or duplicated.

## Ready Care Completion

A Ready Care item is complete when:

1. A contact attempt has been recorded.
2. An outcome has been recorded.
3. Visitor state updates correctly in the Today cockpit.
4. The operator can confidently determine the next status.

## Mark Contacted

Use Mark Contacted only after a real contact attempt or meaningful outreach step.

- phone call attempted
- text message sent
- email sent
- in-person followup completed
- operator confirmed contact attempt with ministry team

## Record Outcome

- resolved
- needs another followup
- no response
- referred to ministry/team
- incorrect or duplicate record

## Outcome Guidance

resolved
- Followup work is complete.

needs another followup
- Additional operator action is expected.

no response
- Followup remains unresolved and may require future action.

referred to ministry/team
- Responsibility has been handed to another ministry or team.

incorrect or duplicate record
- Do not continue followup activity on the record.

## End-of-Day Check

1. Confirm no active card was left mid-action.
2. Note any slow responses or errors.
3. Record unresolved issues in the incident notes template.
4. Confirm any operator confusion or workflow gaps.
5. Share feedback before the next pilot session.

## Common Mistakes to Avoid

- Opening a visitor and assuming that counts as contact.
- Recording an outcome before contact is attempted.
- Using the wrong visitor record when duplicates exist.
- Repeating actions during a slow response.
- Treating staging latency as failure before waiting for completion.
- Using ops/internal tooling as the primary dashboard workflow.

## Escalation

- Ready Care does not load.
- Mark Contacted fails.
- Record Outcome fails.
- A visitor appears under the wrong followup state.
- The queue does not update after a mutation.
- The operator cannot confidently identify the correct visitor.
