# 2026-06-08 — Opportunity Intelligence Backend Signoff Checkpoint

## Context

The latest architecture and dashboard planning docs identify the backend-first rule as the gating decision before creating the new dashboard repository. The new dashboard repository has not been created yet by design. We are holding that step until backend signoff so repo structure, environment variables, and API bindings can align with finalized backend endpoints.

## What landed after the planning docs

Recent merged backend work completed the opportunity intelligence lane that was previously marked as the next target:

- opportunity drilldown metadata
- formation profile segment filters
- formation segment intelligence coverage
- activity intelligence checkpoint notes
- activity intelligence opportunity worklists
- shared opportunity segment definitions
- opportunity worklist regression coverage
- opportunity action reasons
- opportunity intelligence closeout notes
- opportunity resolution intelligence

PR #1090 merged the final opportunity resolution intelligence slice, adding backend-authored resolution metadata so each opportunity segment describes what resolves the opportunity and why.

## Current backend posture

The backend now has canonical opportunity segment definitions for:

- connected-without-next-step
- active-care-without-outcome
- next-step-selected-not-completed
- connected-without-care-owner

Each segment now carries backend-authored:

- label
- priority
- target surface
- drilldown href
- recommended action label
- recommended action reason
- resolution field
- resolution reason

The worklist item shape also keeps the dashboard thin by returning person-level opportunity context with display name, visitorId, stage, owner, recent activity, recommended action, resolution metadata, and visitor detail href.

## Validation

Staging opportunity worklists regression passed on 2026-06-08 using:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-opportunity-worklists.ps1 -BaseUrl "https://hope-ai-api-staging.azurewebsites.net" -ApiKey $env:HOPE_API_KEY
```

Validated:

- connected-without-next-step
- next-step-selected-not-completed
- active-care-without-outcome
- connected-without-care-owner
- invalid segment returns HTTP 400
- limit handling
- pagination replay stability
- visitor detail href shape
- backend-authored recommended action labels/reasons

## Dashboard repo decision

Do not create the new dashboard repository yet from inside this backend closeout branch. The repo should be created or selected only after backend signoff confirms:

- finalized dashboard-facing endpoints
- environment variable names and deployment target
- API authentication/token approach
- dashboard route strategy
- staging/production API binding strategy

This preserves the decision from the dashboard master plan: build a new dashboard as a thin operator surface over canonical backend truth, not as a legacy dashboard repair.

## Backend signoff checklist before dashboard repo creation

- [ ] Confirm the full dashboard-facing endpoint inventory.
- [x] Confirm opportunity worklists and segment filters are regression-covered.
- [ ] Confirm no unresolved backend blockers remain for Today cockpit, visitor snapshot, story/timeline, journey, care queue, and intelligence preview.
- [ ] Confirm OPS-only surfaces remain internal and preview/readiness-only where persistence or orchestration is inactive.
- [ ] Confirm local backend verification command remains current.
- [ ] Confirm CI is green on the backend signoff/docs PR.
- [ ] Confirm staging deploy remains green after merge.

## Next move

Open one focused backend readiness/signoff pass. If it confirms no blocking gaps, the next project lane should be new dashboard repository creation and PR 1: foundation shell, route, layout, design tokens, navigation, and empty states.
