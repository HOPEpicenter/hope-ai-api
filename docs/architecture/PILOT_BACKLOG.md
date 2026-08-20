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

Status: Investigate before building  
Do not build until code/docs confirm whether an existing canonical read model already covers the need.

Decision rule:

- If existing Today + care summary + activity intelligence + opportunity worklists provide enough, build UI only.
- If not, build backend canonical composition read model first.
- Never derive ministry state in the dashboard.

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
