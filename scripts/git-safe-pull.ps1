param(
  [string]$Remote = "origin",
  [string]$Branch = "main"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Exec([string]$cmd) {
  Write-Host ">> $cmd" -ForegroundColor Cyan
  & pwsh -NoProfile -Command $cmd
  if ($LASTEXITCODE -ne 0) { throw "Command failed (exit=$LASTEXITCODE): $cmd" }
}

# Ensure we're in a git repo
Exec "git rev-parse --show-toplevel | Out-Null"

# Fetch latest
Exec "git fetch $Remote --prune"

# If there are local changes, stash them (tracked only)
$porcelain = & git status --porcelain
$needStash = -not [string]::IsNullOrWhiteSpace(($porcelain | Out-String).Trim())

$stashName = $null
if ($needStash) {
  $stashName = 'autostash: git-safe-pull ' + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Write-Host "Local changes detected; stashing tracked changes: $stashName" -ForegroundColor Yellow
  Exec ("git stash push -m " + ('"{0}"' -f $stashName))
}

try {
  # Fast-forward only pull
  Exec "git pull --ff-only $Remote $Branch"
}
finally {
  if ($stashName) {
    # If we stashed, try to re-apply it
    Write-Host "Re-applying autostash..." -ForegroundColor Yellow
    $stashes = & git stash list
    $match = $stashes | Where-Object { $_ -like "*$stashName*" } | Select-Object -First 1

    if ($match) {
      # Extract stash ref like "stash@{0}"
      $stashRef = ($match -split ":")[0].Trim()

      # Pop; if conflicts, user handles them and then can drop stash manually
      & git stash pop "$stashRef"
      if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: stash pop had conflicts. Resolve them, then run: git stash drop `"$stashRef`" (if needed)." -ForegroundColor Yellow
      }
    } else {
      Write-Host "WARNING: autostash not found; nothing to re-apply." -ForegroundColor Yellow
    }
  }
}

Write-Host "OK: git-safe-pull completed." -ForegroundColor Green
