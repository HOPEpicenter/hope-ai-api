param(
  [string]$Base = "http://localhost:7071/api",
  [string]$Vid
)

$key=(Get-Content .\local.settings.json -Raw | ConvertFrom-Json).Values.HOPE_API_KEY
if (-not $Vid) { throw "Pass -Vid <visitorId>" }

$junk="odata|etag|PartitionKey|RowKey|Timestamp|eventRowKey"

Write-Host "== PROFILE =="
$p = curl.exe -s -H "x-api-key: $key" "$Base/formation/profile?visitorId=$Vid"
$p
Write-Host "JUNK MATCHES (PROFILE):"
($p) | Select-String -Pattern $junk

Write-Host "`n== EVENTS =="
$e = curl.exe -s -H "x-api-key: $key" "$Base/formation/events?visitorId=$Vid&limit=50"
$e
Write-Host "JUNK MATCHES (EVENTS):"
($e) | Select-String -Pattern $junk

Write-Host "`n== FOLLOWUP ACTION =="
$payload = @{ visitorId=$Vid; action="assign"; assigneeId="admin" } | ConvertTo-Json -Depth 10
$payload | Set-Content -Encoding utf8 .\tmp.followup.json
$f = curl.exe -s -X POST "$Base/formation/followup/action" -H "x-api-key: $key" -H "Content-Type: application/json" --data-binary "@tmp.followup.json"
$f
Write-Host "JUNK MATCHES (FOLLOWUP):"
($f) | Select-String -Pattern $junk
