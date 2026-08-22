# Phase 4 Staging Rollout Runbook

## Purpose

Validate Phase 4 aggregation reads in staging before any production enablement.

## Guardrails

- Staging only: enable `FEATURE_PHASE4_AGGREGATION` only on `hope-ai-api-staging`.
- Production remains disabled until explicit approval.
- Dashboard production flags remain disabled:
  - `NEXT_PUBLIC_FEATURE_PHASE4_AGGREGATION=false`
  - `NEXT_PUBLIC_FEATURE_PHASE4_TODAY_V2=false`
- Do not use production API keys or unapproved personal records for staging validation.

## Preconditions

1. Backend PR-1 through PR-3 and dashboard PR-4 through PR-5 are merged.
2. The staging backend is healthy at `https://hope-ai-api-staging.azurewebsites.net/api/version`.
3. A staff-approved staging visitor ID is available.
4. `HOPE_API_KEY` is set only in the current PowerShell session.

## Disabled-boundary check

Before enabling staging, verify all four endpoints are protected by the default-off flag:

~~~powershell
$env:HOPE_API_KEY = '<approved staging API key>'
$env:PHASE4_VISITOR_ID = '<approved staging visitor ID>'
pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/assert-phase4-aggregation-staging.ps1 -ExpectDisabled
~~~

## Staging only enablement

Use an authenticated Azure CLI session with access to `rg-hope-ai-api-staging`:

~~~powershell
az functionapp config appsettings set `
  --resource-group 'rg-hope-ai-api-staging' `
  --name 'hope-ai-api-staging' `
  --settings 'FEATURE_PHASE4_AGGREGATION=true'
~~~

Confirm the application restarts and `/api/version` returns HTTP 200.

## Enabled acceptance

~~~powershell
$env:HOPE_API_KEY = '<approved staging API key>'
$env:PHASE4_VISITOR_ID = '<approved staging visitor ID>'
pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/assert-phase4-aggregation-staging.ps1
~~~

The script validates aggregate, timeline, readiness, and snapshot responses with the approved API key.

## Local dashboard validation against staging

Run the dashboard locally with the staging backend and flags enabled only in that local process:

~~~powershell
$env:HOPE_API_BASE_URL = 'https://hope-ai-api-staging.azurewebsites.net/api'
$env:NEXT_PUBLIC_FEATURE_PHASE4_AGGREGATION = 'true'
$env:NEXT_PUBLIC_FEATURE_PHASE4_TODAY_V2 = 'true'
npm run dev
~~~

Verify Person 360 v2 and Today v2 with approved staging data. Then close the local process; do not add these values to production settings.

## Rollback

Disable the staging backend flag immediately:

~~~powershell
az functionapp config appsettings set `
  --resource-group 'rg-hope-ai-api-staging' `
  --name 'hope-ai-api-staging' `
  --settings 'FEATURE_PHASE4_AGGREGATION=false'
~~~

Re-run the disabled-boundary check. Production remains unchanged throughout this runbook.

## Production gate

Production enablement requires explicit approval after staging acceptance and local dashboard review. It is a separate operation, not part of this runbook.
