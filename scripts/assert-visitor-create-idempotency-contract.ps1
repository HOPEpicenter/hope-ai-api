param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [Parameter(Mandatory=$true)]$Condition,
    [Parameter(Mandatory=$true)][string]$Message
  )

  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

$ApiBase = $BaseUrl.TrimEnd("/")
if ($ApiBase -notmatch "/api$") {
  $ApiBase = "$ApiBase/api"
}

$headers = @{}
if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

$email = "visitor-create-contract+$([Guid]::NewGuid().ToString('N'))@example.com"

$requestBody = @{
  name = "Visitor Create Contract"
  email = $email
  phone = "555-0100"
} | ConvertTo-Json

Write-Host "=== ASSERT: Canonical visitor creation semantics ==="
Write-Host "ApiBase=$ApiBase"
Write-Host "Email=$email"

$firstResponse = Invoke-WebRequest `
  -Method Post `
  -Uri "$ApiBase/visitors" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $requestBody `
  -SkipHttpErrorCheck

Assert-True `
  ([int]$firstResponse.StatusCode -eq 201) `
  "First POST /visitors should return HTTP 201 but returned $([int]$firstResponse.StatusCode)."

$firstBody = $firstResponse.Content | ConvertFrom-Json

Assert-True `
  ($firstBody.ok -eq $true) `
  "First POST /visitors should return ok=true."

$firstVisitorId = [string]$firstBody.visitorId

Assert-True `
  (-not [string]::IsNullOrWhiteSpace($firstVisitorId)) `
  "First POST /visitors should return a non-empty visitorId."

$secondResponse = Invoke-WebRequest `
  -Method Post `
  -Uri "$ApiBase/visitors" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $requestBody `
  -SkipHttpErrorCheck

Assert-True `
  ([int]$secondResponse.StatusCode -eq 200) `
  "Duplicate POST /visitors should return HTTP 200 but returned $([int]$secondResponse.StatusCode)."

$secondBody = $secondResponse.Content | ConvertFrom-Json

Assert-True `
  ($secondBody.ok -eq $true) `
  "Duplicate POST /visitors should return ok=true."

$secondVisitorId = [string]$secondBody.visitorId

Assert-True `
  (-not [string]::IsNullOrWhiteSpace($secondVisitorId)) `
  "Duplicate POST /visitors should return a non-empty visitorId."

Assert-True `
  ($secondVisitorId -eq $firstVisitorId) `
  "Duplicate POST /visitors should return the canonical visitorId from the first request."

$detailResponse = Invoke-WebRequest `
  -Method Get `
  -Uri "$ApiBase/visitors/$firstVisitorId" `
  -Headers $headers `
  -SkipHttpErrorCheck

Assert-True `
  ([int]$detailResponse.StatusCode -eq 200) `
  "GET /visitors/{visitorId} should return HTTP 200 but returned $([int]$detailResponse.StatusCode)."

$detailBody = $detailResponse.Content | ConvertFrom-Json

$visitor = $detailBody

if (
  $detailBody.PSObject.Properties.Name -contains "visitor" -and
  $null -ne $detailBody.visitor
) {
  $visitor = $detailBody.visitor
} elseif (
  $detailBody.PSObject.Properties.Name -contains "item" -and
  $null -ne $detailBody.item
) {
  $visitor = $detailBody.item
}

$detailVisitorId = [string]$visitor.visitorId
$detailEmail = [string]$visitor.email

Assert-True `
  ($detailVisitorId -eq $firstVisitorId) `
  "GET /visitors/{visitorId} should return the canonical visitorId."

Assert-True `
  ($detailEmail -eq $email) `
  "GET /visitors/{visitorId} should return the submitted email."

Write-Host `
  "OK: canonical visitor creation contract passed. visitorId=$firstVisitorId" `
  -ForegroundColor Green