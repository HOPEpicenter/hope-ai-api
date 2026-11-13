Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$source = Join-Path $repo 'scripts\e156\Watch-HopeE156CleanupRecovery-v3.ps1'

$expectedHash = 'CD4CCF494F08D3EA9AB74680D90CCCE4670EE4FADC2FBEFF5F994F9283DA2064'

if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -cne $expectedHash) {
    throw 'SOURCE_HASH_MISMATCH'
}

$text = [System.IO.File]::ReadAllText($source)

$pattern = '\$[A-Za-z_][A-Za-z0-9_]*\.PSObject\.Properties\[''nextLink''\]'

$matches = [regex]::Matches($text, $pattern)

if ($matches.Count -ne 1) {
    throw 'EXPECTED_ONE_SAFE_NEXTLINK_ACCESS'
}

$variable = $matches[0].Value.Split('.')[0]

$expression = "(& { `$p = $variable.PSObject.Properties['nextLink']; if (`$null -ne `$p) { `$p.Value } })"

if (-not $text.Contains($expression)) {
    throw 'EXPECTED_PAGINATION_GUARD_NOT_FOUND'
}

$tokens = $null
$errors = $null

[System.Management.Automation.Language.Parser]::ParseFile(
    $source,
    [ref]$tokens,
    [ref]$errors
) | Out-Null

if (@($errors).Count -ne 0) {
    throw 'SOURCE_PARSE_FAILED'
}

# Test the isolated expression from the approved source.
# Never invoke the complete watchdog.

$testBlock = [scriptblock]::Create(
    "param($variable)`n$expression"
)

$missing = [pscustomobject]@{
    value = @()
}

$resultMissing = & $testBlock $missing

if ($null -ne $resultMissing) {
    throw 'MISSING_NEXTLINK_REGRESSION'
}

$expectedNext = 'https://example.invalid/page2'

$present = [pscustomobject]@{
    value = @()
    nextLink = $expectedNext
}

$resultPresent = & $testBlock $present

if ($resultPresent -cne $expectedNext) {
    throw 'PRESENT_NEXTLINK_REGRESSION'
}

$nullLink = [pscustomobject]@{
    value = @()
    nextLink = $null
}

$resultNull = & $testBlock $nullLink

if ($null -ne $resultNull) {
    throw 'NULL_NEXTLINK_REGRESSION'
}

Write-Host '=== PAGINATION REGRESSION RESULTS ==='
Write-Host 'SOURCE_HASH_VERIFIED=True'
Write-Host 'GUARDED_SOURCE_EXPRESSION_VERIFIED=True'
Write-Host 'MISSING_NEXTLINK_PASS=True'
Write-Host 'PRESENT_NEXTLINK_PASS=True'
Write-Host 'NULL_NEXTLINK_PASS=True'
Write-Host 'WATCHDOG_NOT_EXECUTED=True'