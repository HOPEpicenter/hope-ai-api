# Six-Week Visitor Follow-Up Contract v1

**Status:** Backend foundation implemented  
**Owner:** HOPE backend  
**Outbound communication:** None

## Purpose

Create a deterministic six-week staff-task pathway for an eligible first-time visitor so that follow-up responsibility, due work, outcomes, and opt-out decisions remain visible and auditable.

The contract creates staff tasks only. It does not send email, text messages, place calls, or start an external workflow.

## Eligibility and Consent

A plan starts only when:

- the visitor already exists in the canonical Visitors record;
- `contactConsent` is explicitly `true`;
- the mutation actor is an active Staff identity; and
- an optional owner, when supplied, is an active canonical Staff identity.

The visitor card image that informed this phase contains real personal information and is not a development fixture. Tests must use synthetic identities only.

## Deterministic Schedule

| Week | Due offset | Staff action |
| ---: | ---: | --- |
| 1 | 2 days | Make a personal welcome call or email |
| 2 | 7 days | Invite the visitor to return |
| 3 | 14 days | Ask about needs, questions, or prayer |
| 4 | 21 days | Offer a pastoral, group, or ministry connection |
| 5 | 28 days | Discuss an appropriate next faithful step |
| 6 | 35 days | Review the relationship and record the retention outcome |

The backend derives `upcoming`, `due`, and `overdue` from the first-visit date and the read-time `asOf` timestamp. No timer function or background mutation loop is required.

## Canonical Events

- `six_week_followup.plan_started`
- `six_week_followup.owner_assigned`
- `six_week_followup.task_completed`
- `six_week_followup.task_skipped`
- `six_week_followup.plan_paused`
- `six_week_followup.plan_resumed`
- `six_week_followup.plan_cancelled`

Events are immutable. Starting a plan and recording a weekly outcome are idempotent for a visitor/week. Owner changes and plan-status changes retain their event history.

## Protected Product Routes

All routes require `HOPE_API_KEY`.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/visitors/{visitorId}/six-week-followup` | Start the consented plan idempotently. |
| `GET` | `/api/visitors/{visitorId}/six-week-followup` | Read the canonical plan and six tasks. |
| `GET` | `/api/six-week-followups` | Read active/paused staff work for Today and Care. |
| `POST` | `/api/visitors/{visitorId}/six-week-followup/owner` | Assign or reassign the responsible Staff identity. |
| `POST` | `/api/visitors/{visitorId}/six-week-followup/tasks/{weekNumber}/outcome` | Complete or skip one weekly task with an outcome. |
| `POST` | `/api/visitors/{visitorId}/six-week-followup/status` | Pause, resume, or cancel the plan. |

## Projection Rules

- Exactly six task definitions are backend-owned.
- A task is `due` on its due date and `overdue` after that date.
- Completed and skipped dispositions take precedence over calendar state.
- Pausing prevents task outcomes until the plan resumes.
- Cancellation ends the plan and preserves the reason.
- Completing or skipping all six tasks completes the plan.
- Missing owners are projected explicitly through `needsOwner`.
- Queue results exclude orphaned plans whose visitor record no longer exists.

## Dashboard Boundary

The dashboard may:

- show the schedule and staff-task status;
- guide staff to call or email using existing direct actions;
- collect owner, outcome, notes, pause, resume, and cancel commands; and
- present retention summaries from backend-authored facts.

The dashboard must not:

- calculate due or overdue status;
- invent task definitions or plan state;
- send automatic messages;
- contact a visitor without recorded consent; or
- create a frontend-only follow-up schedule.

## Deferred Work

- Dashboard workflow implementation.
- Retention reporting in Insights.
- Intake-form consent and preferred-channel controls.
- Isolated-environment end-to-end failure testing.
- Any automatic outbound communication.
