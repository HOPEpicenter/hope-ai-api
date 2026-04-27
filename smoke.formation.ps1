param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY,
  [string]$Vid
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($Vid)) {
  throw "Pass -Vid <visitorId>"
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY required"
}

$base = $BaseUrl.TrimEnd("/")
$encodedVid = [Uri]::EscapeDataString($Vid)
$headers = @{ "x-api-key" = $ApiKey }

function Show-Json([string]$Title, $Value) {
  Write-Host ""
  Write-Host "== $Title =="
  $Value | ConvertTo-Json -Depth 12
}

$profile = Invoke-RestMethod `
  -Method GET `
  -Uri "$base/api/visitors/$encodedVid/formation/profile" `
  -Headers $headers

$events = Invoke-RestMethod `
  -Method GET `
  -Uri "$base/api/visitors/$encodedVid/formation/events?limit=50" `
  -Headers $headers

$summary = Invoke-RestMethod `
  -Method GET `
  -Uri "$base/api/visitors/$encodedVid/summary" `
  -Headers $headers

$timeline = Invoke-RestMethod `
  -Method GET `
  -Uri "$base/api/integration/timeline?visitorId=$encodedVid&limit=20" `
  -Headers $headers

Show-Json "FORMATION PROFILE" $profile
Show-Json "FORMATION EVENTS" $events
Show-Json "VISITOR SUMMARY FORMATION" $summary.summary.formation
Show-Json "INTEGRATION TIMELINE FORMATION ITEMS" (@($timeline.items) | Where-Object { $_.stream -eq "formation" })

Write-Host ""
Write-Host "Formation smoke check passed."