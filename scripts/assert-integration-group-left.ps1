param([string]$Base = "http://127.0.0.1:3000")

$headers = @{ "x-api-key" = $env:HOPE_API_KEY }

function New-Visitor {
  $body = @{
    name = "Group Left Test"
    email = "group-left-" + (Get-Date -Format "yyyyMMddHHmmssfff") + "@example.com"
  } | ConvertTo-Json

  (Invoke-RestMethod -Method Post -Uri "$Base/api/visitors" -Headers $headers -ContentType "application/json" -Body $body).visitorId
}

function Send-Event($visitorId, $type, $data) {
  $evt = @{
    v = 1
    eventId = [guid]::NewGuid().ToString()
    visitorId = $visitorId
    type = $type
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source = @{ system = "assert-integration-group-left" }
    data = $data
  } | ConvertTo-Json -Depth 10

  $resp = Invoke-WebRequest -Method Post -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $evt
  Write-Host ("EVENT {0}: {1}" -f $type, $resp.Content)
}

$vid = New-Visitor

Send-Event $vid "GROUP_JOINED" @{ groupId = "g1"; displayName = "Group 1" }
Send-Event $vid "GROUP_LEFT" @{ groupId = "g1" }

$profile = Invoke-RestMethod "$Base/api/visitors/$vid/formation/profile" -Headers $headers

if ($profile.profile.groups.Count -ne 0) {
  throw "Expected groups to be empty after GROUP_LEFT"
}

Write-Host "OK: GROUP_LEFT removed group"

