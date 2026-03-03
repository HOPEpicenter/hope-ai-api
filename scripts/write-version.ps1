$ErrorActionPreference = "Stop"

$pkg = Get-Content ".\package.json" -Raw | ConvertFrom-Json
$v = $pkg.version

if (-not $v) { throw "package.json missing version" }

@"
export const VERSION = `"$v`";
"@ | Set-Content ".\src\functions\version\version.ts" -NoNewline

Write-Host "Wrote src/functions/version/version.ts => $v"