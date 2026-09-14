# Controlled Pilot Start Package

## Purpose

This is the operational procedure for onboarding pilot staff and creating the first real visitor records. It complements the [Pilot Operator Workflow Guide](pilot-operator-workflow-guide.md); it does not change ministry state, feature flags, access configuration, or delivery behavior.

## Pilot Boundaries

- Use the authenticated production dashboard for real ministry work.
- Use only staff members with approved Entra access and an active canonical Staff Identity.
- Do not share accounts, API keys, or administrator credentials.
- Do not create test records, send test communications, or use a real visitor record merely to test the system.
- Phase 5 communications delivery remains default-off: no automatic email, text, call, or provider delivery occurs.

## Staff Onboarding

Complete this once for each pilot staff member.

1. Confirm the staff member is approved by the pilot lead and understands the confidentiality expectations.
2. Confirm the staff member can sign in to the production dashboard with their own Entra account.
3. Confirm the dashboard identifies the staff member through an active canonical Staff Identity before assigning care or follow-up work.
4. Review the [Pilot Operator Workflow Guide](pilot-operator-workflow-guide.md), especially contact attempts, outcomes, slow responses, and escalation.
5. Review the staff training manual before the first ministry session.
6. Confirm the staff member knows to stop and escalate rather than guessing when identity, duplicate-record, ownership, or outcome information is unclear.

## First Real Visitor Intake

Use this checklist one visitor at a time.

### Before creating the record

1. Search People for a possible existing record using the visitor's name and available contact details.
2. If a possible duplicate appears, stop intake and have the pilot lead determine the correct record.
3. Obtain only information the visitor has voluntarily provided for ministry care.
4. Decide whether a team-visible or private pastoral note is appropriate before recording sensitive context.

### Create and verify

1. Create the visitor in People using the visitor's correct name and the minimum available contact details.
2. Set the current status honestly; do not select a later-stage status just to advance a workflow.
3. Add only relevant tags and factual notes.
4. Open Person 360 and verify the displayed name, contact details, status, and new note before continuing.
5. If a note needs correction, use the normal note-edit workflow. It preserves the original version and audit history.
6. If an identity field is wrong, correct it through the normal visitor-edit workflow and verify the updated Person 360 view.

### Follow-up decision

1. Review the current care and journey context before assigning or claiming work.
2. Record a contact attempt only after a real outreach step.
3. Record `no response` only after a real attempt; it is not a terminal outcome.
4. Do not repeat a command during a slow response. Wait for the page to refresh and confirm the current backend-authored state.

## When to Stop and Escalate

Stop the action and record an incident when:

- the correct visitor record cannot be identified;
- a possible duplicate is found;
- a dashboard action fails or its result is unclear;
- the displayed owner or follow-up state is unexpected;
- a sensitive note may have been placed at the wrong visibility level; or
- an incorrect terminal outcome may have been recorded.

Use the [incident notes template](incident-notes-template.md). Include the time, the staff member, the visitor ID only when necessary for support, the action attempted, and what the dashboard displayed. Do not include credentials or unnecessary sensitive details.

## End-of-Day Pilot Check

1. Confirm staff did not leave a visitor record or follow-up action mid-process.
2. Confirm any unresolved duplicate, correction, or workflow issue is documented for the pilot lead.
3. Record observed slow responses or errors without retrying state-changing actions blindly.
4. Keep feature flags and communications delivery at their default-off settings unless a separate approved acceptance procedure explicitly says otherwise.

## Related Guidance

- [Pilot Operator Workflow Guide](pilot-operator-workflow-guide.md)
- [Incident Notes Template](incident-notes-template.md)
- [Pilot Readiness](architecture/PILOT_READINESS_V2.md)
