$ErrorActionPreference = "Stop"

# ================= CONFIG =================
$base = "http://localhost:7071/api"

if (-not $env:HOPE_API_KEY) {
  throw "HOPE_API_KEY not set"
}
if (-not $env:STORAGE_CONNECTION_STRING) {
  throw "STORAGE_CONNECTION_STRING not set"
}

$headersApi = @{ "x-api-key" = $env:HOPE_API_KEY }

$createVisitorRoute  = "$base/visitors"
$followupActionRoute = "$base/formation/followup/action"
$followupQueueRoute  = "$base/formation/followup-queue"

$tableName = "devEngagementEvents"


# ================= PARSE CONNECTION STRING =================
$connParts = @{}
$env:STORAGE_CONNECTION_STRING -split ";" | ForEach-Object {
  if ($_ -match "=") {
    $k, $v = $_ -split "=", 2
    $connParts[$k] = $v
  }
}

$accountName = $connParts["AccountName"]
$accountKey  = $connParts["AccountKey"]

if (-not $accountName -or -not $accountKey) {
  throw "Could not parse AccountName / AccountKey from STORAGE_CONNECTION_STRING"
}

$tableHost = $connParts["TableEndpoint"]
if (-not $tableHost) {
  $tableHost = "https://$accountName.table.core.windows.net"
}
$tableHost = $tableHost.TrimEnd("/")

# ================= HELPERS =================
function Assert-True($cond, $msg) {
  if (-not $cond) { throw "ASSERT FAILED: $msg" }
}

function Read-ErrorBody($err) {
  try {
    $resp = $err.Exception.Response
    if ($resp -and $resp.GetResponseStream()) {
      $r = New-Object IO.StreamReader($resp.GetResponseStream())
      return $r.ReadToEnd()
    }
  } catch {}
  return $err.Exception.Message
}

function HttpPostJson($url, $obj) {
  $json = $obj | ConvertTo-Json -Depth 10
  Write-Host "`nPOST $url"
  Write-Host $json
  try {
    Invoke-RestMethod -Method Post -Uri $url -Headers $headersApi -ContentType "application/json" -Body $json
  } catch {
    throw "POST failed ($url): $(Read-ErrorBody $_)"
  }
}

function HttpGet($url) {
  Write-Host "`nGET  $url"
  try {
    Invoke-RestMethod -Method Get -Uri $url -Headers $headersApi
  } catch {
    throw "GET failed ($url): $(Read-ErrorBody $_)"
  }
}

function Get-Queue($visitorId, $cooldownHours) {
  $ub = New-Object System.UriBuilder($followupQueueRoute)
  $ub.Query = "visitorId=$visitorId&limit=50&cooldownHours=$cooldownHours"
  HttpGet $ub.Uri.AbsoluteUri
}

function Count-ForVisitor($queue, $visitorId) {
  @($queue.items | Where-Object { $_.visitorId -eq $visitorId }).Count
}

function Show-VisitorRow($queue, $visitorId) {
  $queue.items | Where-Object { $_.visitorId -eq $visitorId } |
    Select-Object visitorId, engagementCount, lastEngagedAt, engaged, engagementScore |
    Format-Table -Auto | Out-String | Write-Host
}



function New-SharedKeyHeaders($method, $contentType, $resourcePath) {
  $xmsdate = (Get-Date).ToUniversalTime().ToString("R")
  $stringToSign = "$method`n`n$contentType`n$xmsdate`n/$accountName/$resourcePath"

  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [Convert]::FromBase64String($accountKey)
  $sig = [Convert]::ToBase64String(
    $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($stringToSign))
  )

  @{
    "x-ms-date"    = $xmsdate
    "x-ms-version" = "2019-02-02"
    "Authorization"= "SharedKey ${accountName}:$sig"
    "Accept"       = "application/json;odata=nometadata"
    "Content-Type" = $contentType
  }
}

function Ensure-Table {
  Write-Host "`nEnsuring table exists: $tableName"
  $body = @{ TableName = $tableName } | ConvertTo-Json
  try {
    Invoke-RestMethod `
      -Method Post `
      -Uri "$tableHost/Tables" `
      -Headers (New-SharedKeyHeaders "POST" "application/json" "Tables") `
      -Body $body | Out-Null
    Write-Host "Table created"
  } catch {
    if ($_.Exception.Message -match "409|Conflict|AlreadyExists") {
      Write-Host "Table already exists"
    } else {
      throw
    }
  }
}

function Insert-Engagement($visitorId) {
  $occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  $rowKey = "$occurredAt`__$(New-Guid)"

  # Insert into BOTH tables because environments differ:
  # - some code reads devEngagements
  # - some code reads devEngagementEvents
  $targets = @("devEngagements", "devEngagementEvents")

  foreach ($t in $targets) {
    $entity = @{
      PartitionKey = $visitorId
      RowKey       = $rowKey

      # Timestamp fields (cover whichever the code uses)
      occurredAt   = $occurredAt
      createdAt    = $occurredAt
      eventAt      = $occurredAt
      engagedAt    = $occurredAt
      at           = $occurredAt
      type         = "SMOKE_TEST"
      eventType    = "SMOKE_TEST"
      source       = "powershell"
      visitorId    = $visitorId
    } | ConvertTo-Json -Depth 10

    Write-Host "`nINSERT engagement row into $t"
    Invoke-RestMethod `
      -Method Post `
      -Uri "$tableHost/$t" `
      -Headers (New-SharedKeyHeaders "POST" "application/json" $t) `
      -Body $entity | Out-Null
  }
}

# ================= TEST FLOW =================
Write-Host "`n== Phase 6 Cooldown Smoke Test (Azure Table REST) =="

Ensure-Table

# Create visitor
$ts = Get-Date -Format "yyyyMMddHHmmss"
$created = HttpPostJson $createVisitorRoute @{
  name   = "Phase6 Smoke"
  email  = "phase6smoke+$ts@example.com"
  source = "dev"
}

$vid = $created.visitorId
Write-Host "Created visitorId = $vid"
Assert-True ($vid) "visitorId missing"

# Assign followup
HttpPostJson $followupActionRoute @{
  visitorId  = $vid
  action     = "assign"
  assigneeId = "smoke"
} | Out-Null

$q0 = Get-Queue $vid 0
Write-Host "Queue cooldown=0 count=$($q0.count)"
Assert-True ($q0.count -ge 1) "Expected item when cooldown=0"

# Insert engagement
Insert-Engagement $vid
Start-Sleep -Seconds 1

$q24 = Get-Queue $vid 24
Write-Host "Queue cooldown=24 count=$($q24.count)"
Assert-True ($q24.count -eq 0) "Expected suppression at cooldown=24"

$q0b = Get-Queue $vid 0
Write-Host "Queue cooldown=0 count=$($q0b.count)"
Assert-True ($q0b.count -ge 1) "Expected NOT suppressed at cooldown=0"

# Outcome recorded
HttpPostJson $followupActionRoute @{
  visitorId = $vid
  action    = "outcome_recorded"
  outcome   = "connected"
} | Out-Null

$q0f  = Get-Queue $vid 0
$q24f = Get-Queue $vid 24

Assert-True ($q0f.count -eq 0)  "Expected removed after outcome"
Assert-True ($q24f.count -eq 0) "Expected removed after outcome"

Write-Host "`n== ALL TESTS PASSED ✅ =="

