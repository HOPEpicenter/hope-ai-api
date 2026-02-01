$ErrorActionPreference = "Stop"

$dist = Join-Path (Get-Location) "dist"
if (Test-Path $dist) {
  Write-Host "Cleaning dist/ ..."
  Remove-Item -Recurse -Force $dist
}
