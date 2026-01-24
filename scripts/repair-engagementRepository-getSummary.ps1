$ErrorActionPreference = "Stop"

function Fail([string]$msg) { throw $msg }

function Write-Utf8NoBomText([string]$path, [string]$text) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText((Resolve-Path (New-Item -ItemType File -Force $path).FullName), $text, $utf8NoBom)
}

$path = ".\src\storage\engagementRepository.ts"
if (-not (Test-Path $path)) { Fail "Missing $path" }

$text = Get-Content -Raw -LiteralPath $path

$marker = "export class EngagementRepository"
$idx = $text.IndexOf($marker)
if ($idx -lt 0) { Fail "Could not find '$marker' in $path" }

$prefix = $text.Substring(0, $idx)
$classAndRest = $text.Substring($idx)

# Remove any getSummary blocks from prefix (outside the class)
$rxBlock = New-Object System.Text.RegularExpressions.Regex(
  "(?s)\r?\n\s*/\*\*[\s\S]*?\*/\s*\r?\n\s*async\s+getSummary\s*\([\s\S]*?\r?\n\s*\}\s*\r?\n",
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$prefix2 = $rxBlock.Replace($prefix, "")

# Remove any getSummary blocks already inside class (we will insert exactly one)
$class2 = $rxBlock.Replace($classAndRest, "")

$method = @"

  /**
   * Read per-visitor engagement summary snapshot (derived).
   * Returns null if no snapshot exists yet.
   */
  async getSummary(visitorId: string) {
    return this.summaries.get(visitorId);
  }

"@

# Insert before listByVisitor if possible
$rxList = New-Object System.Text.RegularExpressions.Regex(
  "(?s)(\r?\n\s*)async\s+listByVisitor\s*\(",
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

if ($rxList.IsMatch($class2)) {
  $class3 = $rxList.Replace($class2, ('$1' + $method + '$1' + 'async listByVisitor('), 1)
} else {
  # Insert after constructor if possible
  $rxCtor = New-Object System.Text.RegularExpressions.Regex(
    "(?s)(\r?\n\s*constructor\s*\([\s\S]*?\)\s*\{\s*[\s\S]*?\r?\n\s*\}\s*\r?\n)",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  if ($rxCtor.IsMatch($class2)) {
    $class3 = $rxCtor.Replace($class2, ('$1' + $method), 1)
  } else {
    # Insert right after class opening brace
    $rxOpen = New-Object System.Text.RegularExpressions.Regex(
      "(export\s+class\s+EngagementRepository\s*\{\s*)",
      [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    if (-not $rxOpen.IsMatch($class2)) { Fail "Could not find class opening brace in $path" }
    $class3 = $rxOpen.Replace($class2, ('$1' + $method), 1)
  }
}

$fixed = $prefix2 + $class3

# Sanity: ensure exactly one getSummary and it occurs AFTER the class marker
$posClass = $fixed.IndexOf($marker)
$posSummary = $fixed.IndexOf("getSummary(")
if ($posSummary -lt 0) { Fail "Sanity failed: getSummary not found after repair" }
if ($posSummary -lt $posClass) { Fail "Sanity failed: getSummary still appears before class" }

Write-Utf8NoBomText $path $fixed
Write-Host "Repaired: $path"