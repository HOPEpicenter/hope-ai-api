# Read-only GitHub approval provenance inspection.
# This file never authorizes execution.
param(
    [Parameter(Mandatory)]
    [ValidateRange(1, [long]::MaxValue)]
    [long] $RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$repo = 'HOPEpicenter/hope-ai-api'
$workflow = 'phase-c-protected-job-creation.yml'
$environment = 'HOPE-Phase-C-Job-Creation'
$reviewer = 'Hope-2018'

Write-Output '=== PHASE C GITHUB APPROVAL READBACK ==='

$run = gh api "repos/$repo/actions/runs/$RunId" |
    ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    throw 'RUN_READBACK_FAILED'
}

$expectedPath = ".github/workflows/$workflow"

if ([string]$run.path -cne $expectedPath -or
    [string]$run.event -cne 'workflow_dispatch' -or
    [string]$run.head_branch -cne 'main' -or
    [string]$run.repository.full_name -cne $repo) {
    throw 'RUN_IDENTITY_MISMATCH'
}

Write-Output 'EXACT_WORKFLOW_RUN_IDENTITY_VERIFIED=True'

$history = @(
    gh api "repos/$repo/actions/runs/$RunId/approvals" |
        ConvertFrom-Json
)

if ($LASTEXITCODE -ne 0) {
    throw 'APPROVAL_HISTORY_READ_FAILED'
}

$matching = @(
    $history | Where-Object {
        $record = $_
        $environmentMatch = @(
            $record.environments | Where-Object {
                [string]$_.name -ceq $environment
            }
        ).Count -gt 0

        $environmentMatch -and
        [string]$record.user.login -ieq $reviewer
    }
)

$approved = @(
    $matching | Where-Object {
        [string]$_.state -ceq 'approved'
    }
).Count -gt 0

$rejected = @(
    $history | Where-Object {
        $record = $_
        $environmentMatch = @(
            $record.environments | Where-Object {
                [string]$_.name -ceq $environment
            }
        ).Count -gt 0

        $environmentMatch -and
        [string]$record.state -ceq 'rejected'
    }
).Count -gt 0

Write-Output "INDEPENDENT_APPROVAL_FOUND=$approved"
Write-Output "REJECTION_IN_HISTORY=$rejected"

# Approval history alone does not prove the precise operation,
# durable request ID, current approval validity, or execution scope.
Write-Output 'OPERATION_BOUND_AUTHORIZATION=False'
Write-Output 'TRUSTED_OPERATION_ISSUER_CONNECTED=False'
Write-Output 'AZURE_JOB_CREATION_AUTHORIZED=False'

Write-Output '=== FINAL RESULT ==='
Write-Output 'GITHUB_APPROVAL_INSPECTION_COMPLETE=True'
Write-Output 'GITHUB_READ_ONLY=True'
Write-Output 'NO_AZURE_CALLS=True'
Write-Output 'NO_EXECUTION=True'
