# Pilot Backlog

Only verified remaining work belongs here.

## P0 - Documentation Reconciliation

Status: Complete — production E2E evidence synchronized on 2026-08-19
Purpose: Make Pilot Readiness v2 the authoritative engineering operating system.

Tasks:

- Add Pilot Readiness v2 package.
- Update MASTER_PLAN from evidence.
- Update master-checklist from evidence.
- Add updated color-coded architecture flow.
- Keep PR ledger current.

## P1 - Pastor Workflow Continuity Audit

Status: Complete
Purpose: Verify the workspaces feel like one continuous ministry workflow.

Audit path:

```text
Today -> Person 360 -> Journey -> Care -> Insights -> Admin/readiness
```

Check:

- selected person context
- navigation continuity
- loading states
- backend warning behavior
- empty states
- ministry language
- accessibility basics
- action completion clarity

## P2 - Accessibility and Empty-State Audit

Status: Complete
Check keyboard navigation, focus order, labels, contrast, empty/error states, warning banners, and form actions.

## P3 - Morning Briefing Decision

Status: Backend contract implemented, feature-gated, and dashboard adoption deferred
The audit found that Today was an effective operator cockpit but not a single canonical morning decision: it composed care summary, follow-up, activity, and opportunity signals in the dashboard. The backend now owns that composition through the read-only `GET /api/morning-briefing` contract.

Decision rule:

- If existing Today + care summary + activity intelligence + opportunity worklists provide enough, build UI only.
- If not, build backend canonical composition read model first.
- Never derive ministry state in the dashboard.

The contract is disabled by default with `FEATURE_MORNING_BRIEFING`. It reuses canonical care, follow-up, activity-intelligence, and opportunity services; it adds no mutations, orchestration, assignment behavior, or dashboard logic. Unavailable source data produces an explicit incomplete/unavailable response rather than an all-clear briefing.

## P4 - Pilot Validation

Status: Complete — controlled pilot authorized and production E2E closed

Verified result:

- 13 core scenarios passed
- 0 core scenarios failed
- 3 scenarios safely blocked by deliberate production constraints
- TC-13 dashboard-card identity defect corrected in API PR #1169 and verified in production
- private Microsoft Entra sign-in and sign-out round trip passed

Documented safe blocks:

- TC-06 requires a second active Staff identity.
- TC-11 must not bypass production test-record filtering or use a real ministry record solely for testing.
- TC-14B requires an isolated environment for safe backend-failure injection.

No confirmed production E2E defect remains open.

## P5 - Six-Week Visitor Retention Staff Tasks

Status: Complete — deployed and accepted with staff tasks only

Scope:

- Start one six-week plan only after explicit contact consent is recorded.
- Create six backend-authored staff tasks from the first-visit date.
- Require an active canonical Staff actor for every mutation.
- Support owner assignment/reassignment, weekly outcomes, pause, resume, and cancellation.
- Derive due/overdue state deterministically during reads; do not run a scheduler.
- Do not send email, text, or call a visitor automatically.
- Keep dashboard adoption and controlled-pilot validation as separate follow-up slices.

Verified result:

- Backend PR #1198 and dashboard PR #143 deployed the consent-gated, backend-authoritative staff-task workflow.
- Synthetic authorization acceptance passed on 2026-08-27.
- Read-only cross-workspace production acceptance confirmed the active plan and current staff task remain consistent across Today, Person 360, Journey, Care, and Insights.
- No outbound communication automation, scheduler, or real-ministry-data test was introduced.

