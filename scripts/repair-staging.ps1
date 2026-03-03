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
- `version/function.json` scriptFile must point to compiled output:
  `../dist/functions/version/index.js`
- Handler must use classic model (`context.res`) to match function.json.

## Staging repair + redeploy (PowerShell)
Use:
- `scripts/repair-staging.ps1`

## Verify
- Function App state is Running
- App settings present
- /api/version returns JSON

Commands:
```pwsh
az functionapp show -g rg-hope-ai-api-staging -n hope-ai-api-staging --query "{state:state,kind:kind,reserved:reserved}" -o json

az functionapp config appsettings list -g rg-hope-ai-api-staging -n hope-ai-api-staging `
  --query "[?name=='AzureWebJobsStorage' || name=='FUNCTIONS_WORKER_RUNTIME' || name=='FUNCTIONS_EXTENSION_VERSION' || name=='WEBSITE_CONTENTSHARE'].{name:name,value:value}" `
  -o table

Invoke-WebRequest "https://hope-ai-api-staging.azurewebsites.net/api/version" | Select-Object StatusCode, Content '@ | Set-Content .\docs\runbooks\repair-linux-consumption-storage.md -NoNewline

---

## 2) Add the single “repair + build + deploy + verify” script
This script is intentionally idempotent and uses only PS/az/func/npm.

```powershell
@'
param(
  [string]$ResourceGroup = "rg-hope-ai-api-staging",
  [string]$FunctionApp   = "hope-ai-api-staging",
  [string]$StorageAcct   = "hopeaistagingstorage01",
  [string]$ApiBase       = "https://hope-ai-api-staging.azurewebsites.net"
)

$ErrorActionPreference = "Stop"

function Assert-Tool([string]$name, [string]$cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Missing required tool: $name ($cmd)"
  }
}

Assert-Tool "Azure CLI" "az"
Assert-Tool "Functions Core Tools" "func"
Assert-Tool "npm" "npm"

Write-Host "==> Getting storage connection string..."
$storageConn = (az storage account show-connection-string -g $ResourceGroup -n $StorageAcct -o tsv)
if (-not $storageConn) { throw "Failed to retrieve storage connection string for $StorageAcct" }

Write-Host "==> Restoring critical Function App settings..."
az functionapp config appsettings set `
  -g $ResourceGroup -n $FunctionApp `
  --settings `
    "AzureWebJobsStorage=$storageConn" `
    "FUNCTIONS_WORKER_RUNTIME=node" `
    "FUNCTIONS_EXTENSION_VERSION=~4" `
    "WEBSITE_CONTENTAZUREFILECONNECTIONSTRING=$storageConn" `
    "WEBSITE_CONTENTSHARE=$($FunctionApp.ToLower())" `
| Out-Null

Write-Host "==> Restarting Function App..."
az functionapp restart -g $ResourceGroup -n $FunctionApp | Out-Null

Write-Host "==> Installing deps + building..."
npm ci
npm run build
npm run copy
npm run verify:layout

Write-Host "==> Publishing (no build)..."
func azure functionapp publish $FunctionApp --no-build --source .

Write-Host "==> Verifying /api/version..."
$uri = "$ApiBase/api/version"
$r = Invoke-WebRequest -Uri $uri -TimeoutSec 30
"Status: $($r.StatusCode)"
"Content-Type: $($r.Headers['Content-Type'])"
"Body:"
$r.Content