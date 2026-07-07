param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
$ApiBase = $BaseUrl.TrimEnd("/") + "/api"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required."
}

$headers = @{
  "x-api-key" = $ApiKey
  "content-type" = "application/json"
}

function Assert($cond, [string]$msg) {
  if (-not $cond) {
    throw "ASSERT FAILED: $msg"
  }
}

function Json-Post([string]$Url, [hashtable]$Body) {
  Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 20)
}

function Json-Get([string]$Url) {
  Invoke-RestMethod -Method Get -Uri $Url -Headers $headers
}

Write-Host "=== ASSERT: Visitor notes command ==="
Write-Host "ApiBase=$ApiBase"

$visitor = Json-Post "$ApiBase/visitors" @{
  name = "Visitor Notes Command"
  email = "visitor-notes-command+$([Guid]::NewGuid().ToString("N"))@example.com"
  source = "assert-visitor-notes-command.ps1"
}

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be returned"

$noteText = "Pilot visitor note command smoke $([Guid]::NewGuid().ToString("N"))"

$note = Json-Post "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/notes" @{
  text = $noteText
  visibility = "team"
}

Assert ([bool]$note.ok) "note command should return ok=true"
Assert ([bool]$note.accepted) "note command should return accepted=true"
Assert ([string]$note.type -eq "note.add") "note command should return type=note.add"
Assert (-not [string]::IsNullOrWhiteSpace([string]$note.noteId)) "note command should return stable noteId"
Assert ([string]$note.noteId -like "note-*") "noteId should use note-* prefix"
Assert ([string]$note.visitorId -eq $visitorId) "note command visitorId should match"

Start-Sleep -Milliseconds 750

$engagementTimeline = Json-Get "$ApiBase/engagements/timeline?visitorId=$([Uri]::EscapeDataString($visitorId))&limit=20"
$integrationTimeline = Json-Get "$ApiBase/integration/timeline?visitorId=$([Uri]::EscapeDataString($visitorId))&limit=20"

$engNote = @($engagementTimeline.items | Where-Object {
  [string]$_.type -eq "note.add" -and [string]$_.data.text -eq $noteText -and [string]$_.data.noteId -eq [string]$note.noteId
}) | Select-Object -First 1

$integrationNote = @($integrationTimeline.items | Where-Object {
  [string]$_.type -eq "note.add" -and (
    [string]$_.summary -eq $noteText -or [string]$_.data.text -eq $noteText
  )
}) | Select-Object -First 1

Assert ($null -ne $engNote) "engagement timeline should include created note.add"
Assert ($null -ne $integrationNote) "integration timeline should include created note.add"

Write-Host "OK: visitor notes command assertion passed." -ForegroundColor Green
