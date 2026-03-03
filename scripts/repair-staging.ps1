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