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

function Json-Patch([string]$Url, [hashtable]$Body) {
  Invoke-RestMethod -Method Patch -Uri $Url -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 20)
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
$notesRead = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/notes"

$engNote = @($engagementTimeline.items | Where-Object {
  [string]$_.type -eq "note.add" -and [string]$_.data.text -eq $noteText -and [string]$_.data.noteId -eq [string]$note.noteId
}) | Select-Object -First 1

$integrationNote = @($integrationTimeline.items | Where-Object {
  [string]$_.type -eq "note.add" -and (
    [string]$_.summary -eq $noteText -or [string]$_.data.text -eq $noteText
  )
}) | Select-Object -First 1

Assert ($null -ne $engNote) "engagement timeline should include created note.add"
$readNote = @($notesRead.items | Where-Object {
  [string]$_.noteId -eq [string]$note.noteId -and [string]$_.text -eq $noteText
}) | Select-Object -First 1

Assert ($null -ne $integrationNote) "integration timeline should include created note.add"
Assert ([bool]$notesRead.ok) "notes read endpoint should return ok=true"
Assert ([string]$notesRead.visitorId -eq $visitorId) "notes read endpoint visitorId should match"
Assert ($null -ne $readNote) "notes read endpoint should include projected created note"
Assert ([int]$readNote.version -eq 1) "projected created note should have version=1"
Assert (-not [bool]$readNote.edited) "projected created note should not be edited"

$updatedText = "Corrected pastoral note $([Guid]::NewGuid().ToString("N"))"

$updated = Json-Patch "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/notes/$([Uri]::EscapeDataString([string]$note.noteId))" @{
  text = $updatedText
  visibility = "private"
  reason = "Corrected test note"
}

Assert ([bool]$updated.ok) "note update should return ok=true"
Assert ([bool]$updated.accepted) "note update should return accepted=true"
Assert ([string]$updated.type -eq "note.updated") "note update should return type=note.updated"
Assert ([string]$updated.noteId -eq [string]$note.noteId) "note update noteId should match"
Assert ([int]$updated.version -eq 2) "note update should return version=2"

Start-Sleep -Milliseconds 750

$notesAfterUpdate = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/notes"
$engagementTimelineAfterUpdate = Json-Get "$ApiBase/engagements/timeline?visitorId=$([Uri]::EscapeDataString($visitorId))&limit=20"
$integrationTimelineAfterUpdate = Json-Get "$ApiBase/integration/timeline?visitorId=$([Uri]::EscapeDataString($visitorId))&limit=20"

$updatedReadNote = @($notesAfterUpdate.items | Where-Object {
  [string]$_.noteId -eq [string]$note.noteId
}) | Select-Object -First 1

$engUpdated = @($engagementTimelineAfterUpdate.items | Where-Object {
  [string]$_.type -eq "note.updated" -and [string]$_.data.noteId -eq [string]$note.noteId -and [string]$_.data.text -eq $updatedText
}) | Select-Object -First 1

$integrationUpdated = @($integrationTimelineAfterUpdate.items | Where-Object {
  [string]$_.type -eq "note.updated" -and (
    [string]$_.data.noteId -eq [string]$note.noteId -or [string]$_.summary -eq $updatedText
  )
}) | Select-Object -First 1

Assert ($null -ne $updatedReadNote) "notes read endpoint should include updated note"
Assert ([string]$updatedReadNote.text -eq $updatedText) "updated note text should be projected"
Assert ([string]$updatedReadNote.visibility -eq "private") "updated note visibility should be projected"
Assert ([int]$updatedReadNote.version -eq 2) "updated note version should be projected"
Assert ([bool]$updatedReadNote.edited) "updated note should be marked edited"
Assert ($null -ne $updatedReadNote.lastEditedAt) "updated note should include lastEditedAt"
Assert ($updatedReadNote.history.Count -eq 2) "updated note should preserve add and update history"
Assert ($null -ne $engUpdated) "engagement timeline should include note.updated"
Assert ($null -ne $integrationUpdated) "integration timeline should include note.updated"

Write-Host "OK: visitor notes command assertion passed." -ForegroundColor Green
