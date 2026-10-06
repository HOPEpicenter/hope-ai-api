param(
  [Parameter(Mandatory=$false)]
  [ValidateSet("Dormant", "Prepared", "Activated")]
  [string] $ExpectedState = "Dormant",

  [Parameter(Mandatory=$false)]
  [string] $ApiBase =
    "https://hope-ai-api-staging.azurewebsites.net",

  [Parameter(Mandatory=$false)]
  [string] $ResourceGroup =
    "rg-hope-ai-api-staging",

  [Parameter(Mandatory=$false)]
  [string] $FunctionAppName =
    "hope-ai-api-staging"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Invoke-Probe {
  param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("GET", "POST")]
    [string] $Method,

    [Parameter(Mandatory=$true)]
    [string] $Url,

    [Parameter(Mandatory=$false)]
    [string] $Body = $null
  )

  $options = @{
    Method = $Method
    Uri = $Url
    SkipHttpErrorCheck = $true
  }

  if ($null -ne $Body) {
    $options["ContentType"] = "application/json"
    $options["Body"] = $Body
  }

  return Invoke-WebRequest @options
}

function Assert-HttpStatus {
  param(
    [Parameter(Mandatory=$true)]
    $Response,

    [Parameter(Mandatory=$true)]
    [int] $Expected,

    [Parameter(Mandatory=$true)]
    [string] $Description
  )

  $actual = [int] $Response.StatusCode

  if ($actual -ne $Expected) {
    throw "$Description expected HTTP $Expected but received HTTP $actual."
  }

  Write-Host "[PASS] $Description -> HTTP $actual"
}

function Get-AppSetting {
  param(
    [Parameter(Mandatory=$true)]
    [hashtable] $Settings,

    [Parameter(Mandatory=$true)]
    [string] $Name
  )

  if (-not $Settings.ContainsKey($Name)) {
    return $null
  }

  return [string] $Settings[$Name]
}

function Assert-FlagDisabled {
  param(
    [Parameter(Mandatory=$true)]
    [hashtable] $Settings,

    [Parameter(Mandatory=$true)]
    [string] $Name
  )

  $value = Get-AppSetting `
    -Settings $Settings `
    -Name $Name

  if ($null -eq $value -or [string]::IsNullOrWhiteSpace($value)) {
    Write-Host "[PASS] $Name is not configured and therefore fails closed."
    return
  }

  if ($value.Trim().ToLowerInvariant() -ne "false") {
    throw "$Name must be false or absent for state $ExpectedState."
  }

  Write-Host "[PASS] $Name=false"
}

function Assert-FlagEnabled {
  param(
    [Parameter(Mandatory=$true)]
    [hashtable] $Settings,

    [Parameter(Mandatory=$true)]
    [string] $Name
  )

  $value = Get-AppSetting `
    -Settings $Settings `
    -Name $Name

  if (
    [string]::IsNullOrWhiteSpace($value) -or
    $value.Trim().ToLowerInvariant() -ne "true"
  ) {
    throw "$Name must be true for state $ExpectedState."
  }

  Write-Host "[PASS] $Name=true"
}

function Assert-SettingEquals {
  param(
    [Parameter(Mandatory=$true)]
    [hashtable] $Settings,

    [Parameter(Mandatory=$true)]
    [string] $Name,

    [Parameter(Mandatory=$true)]
    [string] $Expected
  )

  $value = Get-AppSetting `
    -Settings $Settings `
    -Name $Name

  if (
    [string]::IsNullOrWhiteSpace($value) -or
    $value.Trim() -ne $Expected
  ) {
    throw "$Name is not configured with the expected value."
  }

  Write-Host "[PASS] $Name has the expected non-secret value."
}

function Assert-SecretPresent {
  param(
    [Parameter(Mandatory=$true)]
    [hashtable] $Settings,

    [Parameter(Mandatory=$true)]
    [string] $Name
  )

  $value = Get-AppSetting `
    -Settings $Settings `
    -Name $Name

  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Name is required for state $ExpectedState."
  }

  Write-Host "[PASS] $Name is configured; value not printed."
}

Write-Host "=== RESEND STAGING READINESS ==="
Write-Host "Expected state: $ExpectedState"
Write-Host "Function App  : $FunctionAppName"
Write-Host "Resource Group: $ResourceGroup"
Write-Host "API base      : $ApiBase"

Write-Host "`n=== 1. VERIFY POWERSHELL AND AZ CLI ==="

if ($PSVersionTable.PSVersion.Major -ne 7) {
  throw "PowerShell 7 is required."
}

Get-Command az -ErrorAction Stop | Out-Null

Write-Host "[PASS] PowerShell 7 and Azure CLI are available."

Write-Host "`n=== 2. READ FUNCTION APP STATE ==="

$appStateJson = @(
  az functionapp show `
    --resource-group $ResourceGroup `
    --name $FunctionAppName `
    --query '{state:state}' `
    --output json `
    --only-show-errors
) -join "`n"

if ($LASTEXITCODE -ne 0) {
  throw "Unable to read staging Function App state."
}

$appState = $appStateJson | ConvertFrom-Json

if ([string] $appState.state -ne "Running") {
  throw "Staging Function App is not Running."
}

Write-Host "[PASS] Staging Function App is Running."

Write-Host "`n=== 3. READ APP SETTINGS WITHOUT PRINTING VALUES ==="

$settingsJson = @(
  az functionapp config appsettings list `
    --resource-group $ResourceGroup `
    --name $FunctionAppName `
    --output json `
    --only-show-errors
) -join "`n"

if ($LASTEXITCODE -ne 0) {
  throw "Unable to read staging app settings."
}

$settingRows = @(
  $settingsJson |
    ConvertFrom-Json
)

$settings = @{}

foreach ($row in $settingRows) {
  $name = [string] $row.name

  if (-not [string]::IsNullOrWhiteSpace($name)) {
    $settings[$name] = [string] $row.value
  }
}

Write-Host "[PASS] App settings loaded into memory; values were not printed."

Write-Host "`n=== 4. VERIFY SAFETY CONFIGURATION ==="

Assert-FlagDisabled `
  -Settings $settings `
  -Name "FEATURE_MINISTRY_EMAIL_DISPATCH_RECOVERY"

switch ($ExpectedState) {
  "Dormant" {
    Assert-FlagDisabled `
      -Settings $settings `
      -Name "FEATURE_PHASE5_COMMUNICATIONS"

    Assert-FlagDisabled `
      -Settings $settings `
      -Name "FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING"

    Assert-FlagDisabled `
      -Settings $settings `
      -Name "FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK"
  }

  "Prepared" {
    Assert-FlagDisabled `
      -Settings $settings `
      -Name "FEATURE_PHASE5_COMMUNICATIONS"

    Assert-FlagDisabled `
      -Settings $settings `
      -Name "FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING"

    Assert-FlagEnabled `
      -Settings $settings `
      -Name "FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK"

    Assert-SettingEquals `
      -Settings $settings `
      -Name "MINISTRY_EMAIL_PROVIDER" `
      -Expected "resend"

    Assert-SecretPresent `
      -Settings $settings `
      -Name "RESEND_API_KEY"

    Assert-SecretPresent `
      -Settings $settings `
      -Name "RESEND_EVENT_WEBHOOK_SIGNING_SECRET"

    Assert-SecretPresent `
      -Settings $settings `
      -Name "RESEND_FROM"

    $from = Get-AppSetting `
      -Settings $settings `
      -Name "RESEND_FROM"

    if (
      $from -notmatch
        '@mail-staging\.hopepicenter\.org'
    ) {
      throw "RESEND_FROM must use the staging sending domain."
    }

    Write-Host "[PASS] RESEND_FROM uses the staging sending domain; value not printed."
  }

  "Activated" {
    Assert-FlagEnabled `
      -Settings $settings `
      -Name "FEATURE_PHASE5_COMMUNICATIONS"

    Assert-FlagEnabled `
      -Settings $settings `
      -Name "FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING"

    Assert-FlagEnabled `
      -Settings $settings `
      -Name "FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK"

    Assert-SettingEquals `
      -Settings $settings `
      -Name "MINISTRY_EMAIL_PROVIDER" `
      -Expected "resend"

    Assert-SecretPresent `
      -Settings $settings `
      -Name "RESEND_API_KEY"

    Assert-SecretPresent `
      -Settings $settings `
      -Name "RESEND_EVENT_WEBHOOK_SIGNING_SECRET"

    Assert-SecretPresent `
      -Settings $settings `
      -Name "RESEND_FROM"

    $from = Get-AppSetting `
      -Settings $settings `
      -Name "RESEND_FROM"

    if (
      $from -notmatch
        '@mail-staging\.hopepicenter\.org'
    ) {
      throw "RESEND_FROM must use the staging sending domain."
    }

    Write-Host "[PASS] RESEND_FROM uses the staging sending domain; value not printed."
  }
}

Write-Host "`n=== 5. VERIFY PUBLIC HEALTH ==="

$health = Invoke-Probe `
  -Method GET `
  -Url "$ApiBase/api/health"

Assert-HttpStatus `
  -Response $health `
  -Expected 200 `
  -Description "Public health boundary"

Write-Host "`n=== 6. VERIFY ADMIN BOUNDARIES FAIL CLOSED ==="

$requestProbe = Invoke-Probe `
  -Method POST `
  -Url "$ApiBase/api/ministry-email-deliveries" `
  -Body "{}"

Assert-HttpStatus `
  -Response $requestProbe `
  -Expected 401 `
  -Description "Unauthenticated ministry email request boundary"

$dispatchProbe = Invoke-Probe `
  -Method POST `
  -Url "$ApiBase/api/ministry-email-deliveries/readiness-probe/dispatch" `
  -Body "{}"

Assert-HttpStatus `
  -Response $dispatchProbe `
  -Expected 401 `
  -Description "Unauthenticated ministry email dispatch boundary"

$inspectionProbe = Invoke-Probe `
  -Method GET `
  -Url "$ApiBase/api/ministry-email-deliveries/readiness-probe/dispatch-inspection"

Assert-HttpStatus `
  -Response $inspectionProbe `
  -Expected 401 `
  -Description "Unauthenticated dispatch inspection boundary"

Write-Host "`n=== 7. VERIFY RESEND WEBHOOK BOUNDARY ==="

$webhookProbe = Invoke-Probe `
  -Method POST `
  -Url "$ApiBase/api/ministry-email/webhooks/resend/events" `
  -Body "{}"

$expectedWebhookStatus =
  if ($ExpectedState -eq "Dormant") {
    404
  }
  else {
    401
  }

Assert-HttpStatus `
  -Response $webhookProbe `
  -Expected $expectedWebhookStatus `
  -Description "Unsigned Resend webhook boundary"

Write-Host "`n=== RESULT ==="
Write-Host "[PASS] Resend staging readiness state matches '$ExpectedState'."
Write-Host "[SAFE] No authenticated ministry-email command was invoked."
Write-Host "[SAFE] No Azure configuration was changed."
Write-Host "[SAFE] No Resend resource was changed."
Write-Host "[SAFE] No ministry data was changed."
Write-Host "[SAFE] No email was sent."
