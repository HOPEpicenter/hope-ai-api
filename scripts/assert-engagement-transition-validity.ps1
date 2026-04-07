param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

Write-Host "Running engagement transition validity invariants..."

function Get-Headers {
  if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "HOPE_API_KEY required"
  }
  return @{ "x-api-key" = $ApiKey }
}

function Create-TestVisitor {
  $res = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/visitors" `
    -ContentType "application/json" `
    -Body (@{
      name  = "Invariant Test"
      email = "inv+$([guid]::NewGuid().ToString('N'))@test.com"
    } | ConvertTo-Json)

  return $res.visitorId
}

function Post-Transition($visitorId, $from, $to) {
  $event = @{
    v = 1
    eventId = "evt-$([guid]::NewGuid().ToString('N'))"
    visitorId = $visitorId
    type = "status.transition"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source = @{ system = "assert-engagement-transition-validity" }
    data = @{
      from = $from
      to   = $to
    }
  } | ConvertTo-Json -Depth 10

  $response = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/engagements/events" `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body $event

  Write-Host "[debug] posted: $from -> $to :: ok=$($response.ok)"
}

function Get-Timeline($visitorId) {
  return Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/engagements/$visitorId/timeline?limit=10" `
    -Headers (Get-Headers)
}

function Assert-ValidTransitions($events) {
  $transitions = $events |
    Where-Object { $_.type -eq "status.transition" } |
    Sort-Object occurredAt

  if (-not $transitions -or $transitions.Count -eq 0) {
    throw "No status.transition events found - invariant not exercised"
  }

  $allowed = @(
    "->ENGAGED",
    "ENGAGED->DISENGAGED",
    "DISENGAGED->ENGAGED"
  )

  $prev = $null

  foreach ($t in $transitions) {
    $curr = $t.data.to

    if ($prev -eq $null) {
      if ($curr -ne "ENGAGED") {
        throw "Invalid first transition: $curr"
      }

      if ($t.data.from -eq $curr) {
        throw "Invalid initial duplicate transition: $curr"
      }
    }
    else {
      $key = "$prev->$curr"

      if ($allowed -notcontains $key) {
        throw "Invalid transition: $key"
      }

      if ($prev -eq $curr) {
        throw "Duplicate transition detected: $curr"
      }
    }

    $prev = $curr
  }

  Write-Host "Transitions valid"
}

$visitorId = Create-TestVisitor

Write-Host "[test] posting transitions"

Post-Transition $visitorId "NEW" "ENGAGED"
Start-Sleep -Milliseconds 50

Post-Transition $visitorId "ENGAGED" "DISENGAGED"
Start-Sleep -Milliseconds 50

Post-Transition $visitorId "DISENGAGED" "ENGAGED"

Write-Host "[test] reading timeline"

$timeline = Get-Timeline $visitorId

Write-Host "[debug] timeline count: $($timeline.items.Count)"
$timeline.items | ConvertTo-Json -Depth 5 | Write-Host

Assert-ValidTransitions $timeline.items

Write-Host "All engagement transition invariants passed."
