param(
    [Parameter(Mandatory=$true)]
    [string]$id
)

Set-Variable -Name id -Value $id -Scope Global

Write-Host "Visitor ID set to $id"
