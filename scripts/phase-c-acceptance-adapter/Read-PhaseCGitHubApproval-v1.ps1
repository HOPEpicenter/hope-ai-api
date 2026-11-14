# Read-only GitHub approval provenance inspection.
# This file never authorizes execution.
param(
    [Parameter(Mandatory)]
    [ValidateRange(1, [long]::MaxValue)]
    [long] $RunId,

    [string] $OperationId,

    [string] $RequestId,

    [switch] $EmitEvidenceJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$repo = 'HOPEpicenter/hope-ai-api'
$workflow = 'phase-c-protected-job-creation.yml'
$environment = 'HOPE-Phase-C-Job-Creation'
$reviewer = 'Hope-2018'

if ($EmitEvidenceJson -and
    (-not $OperationId -or -not $RequestId)) {
    throw 'STRUCTURED_EVIDENCE_REQUIRES_OPERATION_BINDING'
}
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

# Retrieve all pages through the authenticated GitHub CLI.
# --slurp returns an outer array containing the page arrays.
$approvalJson = & gh api `
    "repos/$repo/actions/runs/$RunId/approvals" `
    --paginate --slurp

if ($LASTEXITCODE -ne 0 -or -not $approvalJson) {
    throw 'APPROVAL_HISTORY_READ_FAILED'
}

try {
    $pages = ConvertFrom-Json `
        -InputObject ($approvalJson -join "`n") `
        -Depth 40 `
        -NoEnumerate
}
catch {
    throw 'APPROVAL_HISTORY_JSON_INVALID'
}

if ($pages -isnot [array]) {
    throw 'APPROVAL_HISTORY_PAGINATION_INVALID'
}

$history = @(
    foreach ($page in $pages) {
        if ($page -isnot [array]) {
            throw 'APPROVAL_HISTORY_PAGE_INVALID'
        }

        foreach ($record in $page) {
            if ($null -eq $record -or
                $record -isnot [pscustomobject] -or
                $null -eq $record.user -or
                $record.user -isnot [pscustomobject] -or
                $record.environments -isnot [array] -or
                $record.state -isnot [string]) {
                throw 'APPROVAL_HISTORY_RECORD_INVALID'
            }

            $record
        }
    }
)

# Optional operation-specific job evidence validation.
# This cannot authorize Azure execution.
if ($OperationId -or $RequestId) {
    $uuid4 = '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

    if ($OperationId -cnotmatch $uuid4 -or
        $RequestId -cnotmatch $uuid4) {
        throw 'OPERATION_REQUEST_ID_INVALID'
    }

    $jobsJson = & gh api `
        "repos/$repo/actions/runs/$RunId/jobs?per_page=100" `
        --paginate --slurp

    if ($LASTEXITCODE -ne 0 -or -not $jobsJson) {
        throw 'RUN_JOBS_READ_FAILED'
    }

    try {
        $jobPages = ConvertFrom-Json `
            -InputObject ($jobsJson -join "`n") `
            -Depth 40 `
            -NoEnumerate
    }
    catch {
        throw 'RUN_JOBS_JSON_INVALID'
    }

    if ($jobPages -isnot [array] -or $jobPages.Count -eq 0) {
        throw 'RUN_JOBS_PAGINATION_INVALID'
    }

    $jobs = @()
    $expectedTotal = $null

    foreach ($page in $jobPages) {
        if ($null -eq $page -or
            $page -isnot [pscustomobject] -or
            $page.jobs -isnot [array] -or
            $page.total_count -isnot [long] -and
            $page.total_count -isnot [int]) {
            throw 'RUN_JOBS_PAGE_INVALID'
        }

        if ($null -eq $expectedTotal) {
            $expectedTotal = [long]$page.total_count
        }
        elseif ($expectedTotal -ne [long]$page.total_count) {
            throw 'RUN_JOBS_TOTAL_MISMATCH'
        }

        foreach ($job in $page.jobs) {
            if ($null -eq $job -or
                $job -isnot [pscustomobject] -or
                $job.name -isnot [string] -or
                [long]$job.run_id -ne $RunId) {
                throw 'RUN_JOB_EVIDENCE_INVALID'
            }

            $jobs += $job
        }
    }

    if ($jobs.Count -ne $expectedTotal) {
        throw 'RUN_JOBS_INCOMPLETE'
    }

    $expectedName = "DISABLED operation=$OperationId request=$RequestId"

    $matching = @(
        $jobs | Where-Object {
            $_.name -ceq $expectedName
        }
    )

    if ($matching.Count -ne 1) {
        throw 'JOB_OPERATION_BINDING_MISMATCH'
    }

    Write-Output 'JOB_OPERATION_BINDING_VERIFIED=True'
    Write-Output 'JOB_EVIDENCE_CONSISTENT_NOT_AUTHORIZED=True'
    if ($EmitEvidenceJson) {
        # Check the entire supplied history before emitting evidence.
        # This does not authenticate history or grant authority.
        $protected = @(
            $history | Where-Object {
                $record = $_
                @($record.environments | Where-Object {
                    $_.name -ceq $environment
                }).Count -gt 0
            }
        )

        $validApprovals = @(
            $protected | Where-Object {
                $_.state -ceq 'approved' -and
                $_.user.login -ieq $reviewer
            }
        )

        $rejections = @(
            $protected | Where-Object {
                $_.state -ceq 'rejected'
            }
        )

        if ($validApprovals.Count -ne 1 -or
            $rejections.Count -gt 0) {
            throw 'STRUCTURED_APPROVAL_HISTORY_NOT_ACCEPTABLE'
        }

        # Raw evidence is observational data, not an authorization.
        # No credentials, tokens, or Azure operations are involved.
        $record = [ordered]@{
            schema = 'phase-c-github-evidence-v1'
            operationId = $OperationId
            requestId = $RequestId
            runId = $RunId
            run = $run
            job = $matching[0]
            history = @($history)
            executionAuthorized = $false
            trustedIssuerConnected = $false
        }

        $json = ConvertTo-Json `
            -InputObject $record `
            -Depth 40 `
            -Compress

        Write-Output ('EVIDENCE_JSON=' + $json)
    }
}
Write-Output 'APPROVAL_HISTORY_PAGES_RETRIEVED=True'
Write-Output "APPROVAL_HISTORY_RECORD_COUNT=$($history.Count)"

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
