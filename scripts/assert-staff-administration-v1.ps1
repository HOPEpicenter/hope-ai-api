param(
  [string]$BaseUrl = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY,
  [string]$AdminApiKey = $env:HOPE_ADMIN_API_KEY
)

$ErrorActionPreference = "Stop"

$ApiBase = $BaseUrl.TrimEnd("/")

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required."
}

if ([string]::IsNullOrWhiteSpace($AdminApiKey)) {
  throw "HOPE_ADMIN_API_KEY is required."
}

function Assert {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Invoke-ExpectStatus {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [hashtable]$Body,
    [int]$ExpectedStatus
  )

  try {
    $params = @{
      Method = $Method
      Uri = $Uri
      Headers = $Headers
      SkipHttpErrorCheck = $true
    }

    if ($null -ne $Body) {
      $params.ContentType = "application/json"
      $params.Body = $Body | ConvertTo-Json -Depth 20
    }

    $response = Invoke-WebRequest @params

    Assert `
      ($response.StatusCode -eq $ExpectedStatus) `
      "Expected HTTP $ExpectedStatus from $Method $Uri; received $($response.StatusCode)."

    if ([string]::IsNullOrWhiteSpace($response.Content)) {
      return $null
    }

    return $response.Content | ConvertFrom-Json
  }
  catch {
    throw "Request failed for $Method $Uri. $($_.Exception.Message)"
  }
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [hashtable]$Body
  )

  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = $Body | ConvertTo-Json -Depth 20
  }

  return Invoke-RestMethod @params
}

$readHeaders = @{
  "x-api-key" = $ApiKey
}

$adminHeaders = @{
  "x-admin-api-key" = $AdminApiKey
}

Write-Host "=== ASSERT: Dynamic Staff Administration v1 ==="
Write-Host "ApiBase=$ApiBase"

$unique = [Guid]::NewGuid().ToString("N")
$createUri = "$ApiBase/staff-identities"

$createBody = @{
  displayName = "Pastor Dynamic $unique"
  roleLabel = "Care Pastor"
  actorId = "staff-admin-assertion"
}

$missingAuth = Invoke-ExpectStatus `
  -Method "POST" `
  -Uri $createUri `
  -Headers @{} `
  -Body $createBody `
  -ExpectedStatus 401

Assert `
  ([bool](-not $missingAuth.ok)) `
  "Missing administrative key should return ok=false."

$invalidAuth = Invoke-ExpectStatus `
  -Method "POST" `
  -Uri $createUri `
  -Headers @{ "x-admin-api-key" = "invalid-admin-key" } `
  -Body $createBody `
  -ExpectedStatus 401

Assert `
  ([bool](-not $invalidAuth.ok)) `
  "Invalid administrative key should return ok=false."

$created = Invoke-Json `
  -Method "POST" `
  -Uri $createUri `
  -Headers $adminHeaders `
  -Body $createBody

Assert ([bool]$created.ok) "Create should return ok=true."
Assert ([bool]$created.accepted) "Create should return accepted=true."
Assert ([string]$created.type -eq "staff.created") "Create should emit staff.created."
Assert (-not [string]::IsNullOrWhiteSpace([string]$created.eventId)) "Create should return eventId."
Assert (-not [string]::IsNullOrWhiteSpace([string]$created.staffId)) "Create should return staffId."

$staffId = [string]$created.staffId
$escapedStaffId = [Uri]::EscapeDataString($staffId)

$directoryAfterCreate = Invoke-Json `
  -Method "GET" `
  -Uri "$ApiBase/staff-identities" `
  -Headers $readHeaders `
  -Body $null

$createdIdentity = @(
  $directoryAfterCreate.items |
    Where-Object { [string]$_.staffId -eq $staffId }
) | Select-Object -First 1

Assert ($null -ne $createdIdentity) "Projected directory should contain created identity."
Assert ([string]$createdIdentity.displayName -eq $createBody.displayName) "Created displayName should be projected."
Assert ([string]$createdIdentity.roleLabel -eq "Care Pastor") "Created roleLabel should be projected."
Assert ([string]$createdIdentity.status -eq "active") "Created identity should be active."

$updatedName = "Pastor Updated $unique"

$updated = Invoke-Json `
  -Method "PATCH" `
  -Uri "$ApiBase/staff-identities/$escapedStaffId" `
  -Headers $adminHeaders `
  -Body @{
    displayName = $updatedName
    roleLabel = "Lead Care Pastor"
    reason = "Staff administration assertion update"
    actorId = "staff-admin-assertion"
  }

Assert ([bool]$updated.ok) "Update should return ok=true."
Assert ([bool]$updated.accepted) "Update should return accepted=true."
Assert ([string]$updated.type -eq "staff.updated") "Update should emit staff.updated."
Assert ([string]$updated.staffId -eq $staffId) "Update should preserve staffId."

$directoryAfterUpdate = Invoke-Json `
  -Method "GET" `
  -Uri "$ApiBase/staff-identities" `
  -Headers $readHeaders `
  -Body $null

$updatedIdentity = @(
  $directoryAfterUpdate.items |
    Where-Object { [string]$_.staffId -eq $staffId }
) | Select-Object -First 1

Assert ($null -ne $updatedIdentity) "Projected directory should contain updated identity."
Assert ([string]$updatedIdentity.displayName -eq $updatedName) "Updated displayName should be projected."
Assert ([string]$updatedIdentity.roleLabel -eq "Lead Care Pastor") "Updated roleLabel should be projected."
Assert ([string]$updatedIdentity.status -eq "active") "Updated identity should remain active."

$deactivated = Invoke-Json `
  -Method "PATCH" `
  -Uri "$ApiBase/staff-identities/$escapedStaffId" `
  -Headers $adminHeaders `
  -Body @{
    status = "inactive"
    reason = "Staff administration assertion deactivation"
    actorId = "staff-admin-assertion"
  }

Assert ([bool]$deactivated.ok) "Deactivate should return ok=true."
Assert ([bool]$deactivated.accepted) "Deactivate should return accepted=true."
Assert ([string]$deactivated.type -eq "staff.deactivated") "Deactivate should emit staff.deactivated."
Assert ([string]$deactivated.staffId -eq $staffId) "Deactivate should preserve staffId."

$directoryAfterDeactivate = Invoke-Json `
  -Method "GET" `
  -Uri "$ApiBase/staff-identities" `
  -Headers $readHeaders `
  -Body $null

$inactiveIdentity = @(
  $directoryAfterDeactivate.items |
    Where-Object { [string]$_.staffId -eq $staffId }
) | Select-Object -First 1

Assert ($null -ne $inactiveIdentity) "Projected directory should preserve deactivated identity."
Assert ([string]$inactiveIdentity.displayName -eq $updatedName) "Deactivation should preserve displayName."
Assert ([string]$inactiveIdentity.roleLabel -eq "Lead Care Pastor") "Deactivation should preserve roleLabel."
Assert ([string]$inactiveIdentity.status -eq "inactive") "Deactivated identity should project inactive status."

Write-Host "OK: Dynamic Staff Administration v1 assertion passed." -ForegroundColor Green
