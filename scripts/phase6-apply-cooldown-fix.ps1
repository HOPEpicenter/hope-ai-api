$ErrorActionPreference = "Stop"

$path = "src/functions/formation/getFormationFollowupQueue.ts"
if (-not (Test-Path $path)) { throw "File not found: $path" }

$src = Get-Content $path -Raw

function Insert-AfterImports([string]$text, [string]$insert) {
  $m = [regex]::Match($text, '^(?:import .*?;\r?\n)+', 'Multiline')
  if (-not $m.Success) { throw "Could not find import block." }
  return $text.Insert($m.Length, "`r`n$insert")
}

# Inject helpers to allow cooldownHours=0 (non-negative parser)
if ($src -notmatch "function\s+parseNonNegativeInt\s*\(") {
$helpers = @"
function parseNonNegativeInt(value: string | null, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return n < 0 ? fallback : n; // allow 0
}

function hoursBetween(nowMs: number, pastMs: number): number {
  return (nowMs - pastMs) / (1000 * 60 * 60);
}

"@
  $src = Insert-AfterImports $src $helpers
  Write-Host "Injected helpers."
} else {
  Write-Host "Helpers already present."
}

# Replace cooldownHours parsing to allow 0 (fixes parsePositiveInt bug)
$before = $src
$src = [regex]::Replace(
  $src,
  'const\s+cooldownHours\s*=\s*parsePositiveInt\s*\(\s*req\.query\.get\(\s*[\'"]cooldownHours[\'"]\s*\)\s*,\s*(\d+)\s*\)\s*;\s*',
  'const cooldownHours = parseNonNegativeInt(req.query.get("cooldownHours"), $1);' + "`r`n",
  'IgnoreCase'
)

if ($src -eq $before) {
  throw "Could not find the cooldownHours parsePositiveInt(...) line to replace. Paste the line where cooldownHours is defined."
}
Write-Host "Updated cooldownHours parsing."

# Inject suppression logic before the first results.push(
if ($src -notmatch "Phase 6 \(Option A\): cooldown suppression") {
  $m = [regex]::Match($src, '\r?\n\s*results\.push\s*\(', 'IgnoreCase')
  if (-not $m.Success) { throw "Could not find results.push(...) to inject suppression logic." }

  $inject = @"
    // Phase 6 (Option A): cooldown suppression based on engagement
    // - If cooldownHours > 0 and lastEngagedAt exists and hoursSinceEngaged < cooldownHours => suppress
    // - If cooldownHours === 0 => cooldown disabled (do not suppress)
    if (cooldownHours > 0) {
      const lastEngagedAtRaw = (engagementSummary as any)?.lastEngagedAt ?? null;
      if (typeof lastEngagedAtRaw === "string" && lastEngagedAtRaw.length > 0) {
        const lastMs = Date.parse(lastEngagedAtRaw);
        if (!Number.isNaN(lastMs)) {
          const nowMs = Date.now();
          const hoursSinceEngaged = hoursBetween(nowMs, lastMs);
          if (hoursSinceEngaged < cooldownHours) {
            continue;
          }
        }
      }
    }

"@

  $src = $src.Insert($m.Index, "`r`n" + $inject)
  Write-Host "Injected suppression logic."
} else {
  Write-Host "Suppression logic already present."
}

# Auto-detect variable used with .lastEngagedAt and replace engagementSummary if needed
$matchLast = [regex]::Match($src, '\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*lastEngagedAt\b')
if ($matchLast.Success) {
  $name = $matchLast.Groups[1].Value
  if ($name -ne "engagementSummary") {
    $src = $src -replace '\bengagementSummary\b', $name
    Write-Host "Adjusted injected variable name: engagementSummary -> $name"
  }
} else {
  Write-Host "WARNING: Could not auto-detect a variable with .lastEngagedAt. If build fails, paste the part of the queue code where engagement is attached." -ForegroundColor Yellow
}

Set-Content -Path $path -Value $src -Encoding UTF8
Write-Host "Patch applied to $path."
