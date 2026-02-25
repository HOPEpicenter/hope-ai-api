$ErrorActionPreference = "Stop"

# --- Dependencies (for writing to Azure Table Storage directly) ---
Import-Module AzTable

# --- Config ---
$base = "http://localhost:7071/api"

if (-not $env:HOPE_API_KEY) { throw "HOPE_API_KEY env var not set. Example: `$env:HOPE_API_KEY = '...'" }
if (-not $env:STORAGE_CONNECTION_STRING) { throw "STORAGE_CONNECTION_STRING env var not set. Example: `$env:STORAGE_CONNECTION_STRING = '...'" }

$headers = @{ "x-api-key" = $env:HOPE_API_KEY }
$conn = $env:STORAGE_CONNECTION_STRING

$createVisitorRoute   = "$base/visitors"
$followupActionRoute  = "$base/formation/followup/action"
$followupQueueRoute   = "$base/formation/followup-queue"

# IMPORTANT: If your tableName() prefixes names, adjust this to match the real local table name.
$engagementsTableName = "Engagements"

function Assert-True($condition, $message) {
  if (-not $condition) { throw "ASSERT FAILED: $message" }
}

function Read-ErrorBody($err) {
  try {
    $resp = $err.Exception.Response
    if ($resp -and $resp.GetResponseStream()) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      return $reader.ReadToEnd()
    }
  } catch {}
  return $err.Exception.Message
}

function HttpPostJson($url, $obj) {
  $json = $obj | ConvertTo-Json -Depth 10
  Write-Host "`nPOST $url"
  Write-Host $json
  try {
    return Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body $json
  } catch {
    $body = Read-ErrorBody $_
    throw "POST failed ($url): $body"
  }
}

function HttpGet($url) {
  Write-Host "`nGET  $url"
  try {
    return Invoke-RestMethod -Method Get -Uri $url -Headers $headers
  } catch {
    $body = Read-ErrorBody $_
    throw "GET failed ($url): $body"
  }
}

function Add-EngagementEventToTable($visitorId, $occurredAtIso) {
  $ctx = New-AzStorageContext -ConnectionString $conn

  $table = Get-AzStorageTable -Name $engagementsTableName -Context $ctx -ErrorAction SilentlyContinue
  if (-not $table) { $table = New-AzStorageTable -Name $engagementsTableName -Context $ctx }

  $rowKey = ("{0}__{1}" -f $occurredAtIso, ([guid]::NewGuid().ToString("N")))

  $props = @{
    occurredAt = $occurredAtIso
    type       = "SMOKE_TEST"
    source     = "powershell"
  }

  Add-AzTableRow -Table $table.CloudTable -PartitionKey $visitorId -RowKey $rowKey -Property $props | Out-Null
  Write-Host "Inserted engagement row: PK=$visitorId RK=$rowKey occurredAt=$occurredAtIso"
}

Write-Host "== Phase 6 Cooldown Smoke Test (correct followup/action + table engagement) =="

# 1) Create visitor
$ts = Get-Date -Format "yyyyMMddHHmmss"
$created = HttpPostJson $createVisitorRoute @{
  name   = "Phase6 Smoke"
  email  = "phase6smoke+$ts@example.com"
  source = "dev"
}

$vid = $created.visitorId
Write-Host "Created visitorId = $vid"
Assert-True ($vid -and $vid.Length -gt 10) "createVisitor did not return a valid visitorId."

# 2) assign -> appears in queue
# Validator requires metadata.assigneeId for FOLLOWUP_ASSIGNED, and handler folds assigneeId into metadata.
HttpPostJson $followupActionRoute @{
  visitorId  = $vid
  action     = "assign"
  assigneeId = "smoke"
} | Out-Null

$q0 = HttpGet "$followupQueueRoute?visitorId=$vid&limit=50&cooldownHours=0"
Write-Host "Queue cooldownHours=0 count=$($q0.count)"
Assert-True ($q0.count -ge 1) "Expected assigned item to appear when cooldownHours=0 (before engagement)."

# 3) insert engagement -> suppressed when cooldownHours=24
$occurredAt = (Get-Date).ToUniversalTime().ToString("o")
Add-EngagementEventToTable $vid $occurredAt

$q24 = HttpGet "$followupQueueRoute?visitorId=$vid&limit=50&cooldownHours=24"
Write-Host "Queue cooldownHours=24 count=$($q24.count)"
Assert-True ($q24.count -eq 0) "Expected suppression when cooldownHours=24 after engagement."

# 4) cooldownHours=0 disables suppression
$q0b = HttpGet "$followupQueueRoute?visitorId=$vid&limit=50&cooldownHours=0"
Write-Host "Queue cooldownHours=0 count=$($q0b.count)"
Assert-True ($q0b.count -ge 1) "Expected NOT suppressed when cooldownHours=0."

# 5) outcome_recorded -> removed regardless
# Validator requires metadata.outcome; allowed outcomes are lowercase (connected|left_message|no_response|closed|needs_care)
HttpPostJson $followupActionRoute @{
  visitorId = $vid
  action    = "outcome_recorded"
  outcome   = "connected"
} | Out-Null

$q0final  = HttpGet "$followupQueueRoute?visitorId=$vid&limit=50&cooldownHours=0"
$q24final = HttpGet "$followupQueueRoute?visitorId=$vid&limit=50&cooldownHours=24"
Write-Host "Final counts: cooldown0=$($q0final.count) cooldown24=$($q24final.count)"

Assert-True ($q0final.count -eq 0)  "Expected removed after connected outcome (cooldownHours=0)."
Assert-True ($q24final.count -eq 0) "Expected removed after connected outcome (cooldownHours=24)."

Write-Host "`n== ALL TESTS PASSED OK =="

