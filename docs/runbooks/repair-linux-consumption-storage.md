# Repair: Linux Consumption Function App lost storage + broken app settings

## Symptoms
- AzureWebJobsStorage is null
- FUNCTIONS_WORKER_RUNTIME is null
- FUNCTIONS_EXTENSION_VERSION is null
- Portal refuses to save app settings
- Worker does not start / functions never execute
- /api/version returns blank or 404

## Root cause (typical)
Linux Consumption host needs a working storage configuration to initialize correctly. If storage is recreated or content share settings are lost, the host can fail to start and management operations may behave inconsistently.

## Required app settings (minimum)
- AzureWebJobsStorage
- FUNCTIONS_WORKER_RUNTIME=node
- FUNCTIONS_EXTENSION_VERSION=~4

Recommended (content share; helps avoid mount/content issues):
- WEBSITE_CONTENTAZUREFILECONNECTIONSTRING
- WEBSITE_CONTENTSHARE

## Repo guardrails
- `npm run verify:layout` must pass before deploying.
- `version/function.json` must exist at repo root for discovery (current model).
- `version/function.json` scriptFile must point to compiled output: `../dist/functions/version/index.js`
- Handler must use classic model (`context.res`) to match function.json.

## Staging repair + redeploy (PowerShell)
Use:
- `scripts/repair-staging.ps1`

## Verify
```pwsh
az functionapp show -g rg-hope-ai-api-staging -n hope-ai-api-staging --query "{state:state,kind:kind,reserved:reserved}" -o json

az functionapp config appsettings list -g rg-hope-ai-api-staging -n hope-ai-api-staging `
  --query "[?name=='AzureWebJobsStorage' || name=='FUNCTIONS_WORKER_RUNTIME' || name=='FUNCTIONS_EXTENSION_VERSION' || name=='WEBSITE_CONTENTSHARE'].{name:name,value:value}" `
  -o table

Invoke-WebRequest "https://hope-ai-api-staging.azurewebsites.net/api/version" | Select-Object StatusCode, Content