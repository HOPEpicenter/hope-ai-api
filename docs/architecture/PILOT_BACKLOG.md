# Pilot Backlog

Only verified remaining work belongs here.

## P0 - Documentation Reconciliation

Status: Active  
Purpose: Make Pilot Readiness v2 the authoritative engineering operating system.

Tasks:

- Add Pilot Readiness v2 package.
- Update MASTER_PLAN from evidence.
- Update master-checklist from evidence.
- Add updated color-coded architecture flow.
- Keep PR ledger current.

## P1 - Pastor Workflow Continuity Audit

Status: Ready  
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

Status: Ready  
Check keyboard navigation, focus order, labels, contrast, empty/error states, warning banners, and form actions.

## P3 - Morning Briefing Decision

Status: Investigate before building  
Do not build until code/docs confirm whether an existing canonical read model already covers the need.

Decision rule:

- If existing Today + care summary + activity intelligence + opportunity worklists provide enough, build UI only.
- If not, build backend canonical composition read model first.
- Never derive ministry state in the dashboard.

## P4 - Pilot Validation

Status: Ready after P0-P2  
Run full pastor workflow against deployed dashboard and API.
