# Offline synthetic GitHub job-binding regressions.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$reader = Join-Path $PSScriptRoot 'Read-PhaseCGitHubApproval-v1.ps1'

$global:op = '12345678-1234-4123-8123-123456789abc'
$global:req = '87654321-4321-4321-8321-cba987654321'
$global:jobName = "DISABLED operation=$global:op request=$global:req"

$global:runJson = '{"id":123,"path":".github/workflows/phase-c-protected-job-creation.yml","event":"workflow_dispatch","head_branch":"main","repository":{"full_name":"HOPEpicenter/hope-ai-api"}}'
$global:approvalJson = '[[{"state":"approved","user":{"login":"Hope-2018"},"environments":[{"name":"HOPE-Phase-C-Job-Creation"}]}]]'
$global:jobsJson = ''
$global:callCount = 0

function global:gh {
    param(
        [Parameter(ValueFromRemainingArguments)]
        [string[]] $Arguments
    )

    $global:callCount++
    $global:LASTEXITCODE = 0

    if ($Arguments[0] -cne 'api') {
        throw 'UNEXPECTED_GITHUB_COMMAND'
    }

    $endpoint = $Arguments[1]

    if ($endpoint -ceq 'repos/HOPEpicenter/hope-ai-api/actions/runs/123') {
        return $global:runJson
    }

    if ($endpoint -ceq 'repos/HOPEpicenter/hope-ai-api/actions/runs/123/approvals') {
        if ('--paginate' -cnotin $Arguments -or
            '--slurp' -cnotin $Arguments) {
            throw 'APPROVAL_PAGINATION_MISSING'
        }
        return $global:approvalJson
    }

    if ($endpoint -ceq 'repos/HOPEpicenter/hope-ai-api/actions/runs/123/jobs?per_page=100') {
        if ('--paginate' -cnotin $Arguments -or
            '--slurp' -cnotin $Arguments) {
            throw 'JOB_PAGINATION_MISSING'
        }
        return $global:jobsJson
    }

    throw "UNEXPECTED_ENDPOINT: $endpoint"
}

function Invoke-BindingReader {
    param(
        [string] $Operation = $global:op,
        [string] $Request = $global:req
    )

    $global:callCount = 0

    $result = @(
        & $reader -RunId 123 -OperationId $Operation -RequestId $Request
    )

    if ($global:callCount -ne 3) {
        throw 'EXPECTED_THREE_MOCK_GITHUB_CALLS'
    }

    return ,$result
}

function Assert-Line {
    param(
        [string[]] $Output,
        [string] $Expected
    )

    if ($Expected -cnotin $Output) {
        throw "EXPECTED_OUTPUT_MISSING: $Expected"
    }
}

function New-JobsJson {
    param(
        [object[]] $Jobs,
        [int] $Total
    )

    $page = @{
        total_count = $Total
        jobs = @($Jobs)
    }

    ConvertTo-Json -InputObject @($page) -Depth 20 -Compress
}

$validJob = @{
    run_id = 123
    name = $global:jobName
}

Write-Host '=== VALID JOB BINDING ==='

$global:jobsJson = New-JobsJson -Jobs @($validJob) -Total 1

$result = Invoke-BindingReader

Assert-Line $result 'JOB_OPERATION_BINDING_VERIFIED=True'
Assert-Line $result 'JOB_EVIDENCE_CONSISTENT_NOT_AUTHORIZED=True'
Assert-Line $result 'AZURE_JOB_CREATION_AUTHORIZED=False'
Assert-Line $result 'NO_EXECUTION=True'

Write-Host 'PASS=VALID_JOB_BINDING_NONAUTHORIZING'

Write-Host '=== MISMATCHED JOB ==='

$global:jobsJson = New-JobsJson -Jobs @(
    @{ run_id = 123; name = 'DISABLED operation=wrong request=wrong' }
) -Total 1

$denied = $false
try {
    $null = Invoke-BindingReader
}
catch {
    $denied = $true
}

if (-not $denied) {
    throw 'MISMATCHED_JOB_ACCEPTED'
}

Write-Host 'PASS=MISMATCHED_JOB_DENIED'

Write-Host '=== DUPLICATE MATCHING JOBS ==='

$global:jobsJson = New-JobsJson -Jobs @(
    $validJob, $validJob
) -Total 2

$denied = $false
try {
    $null = Invoke-BindingReader
}
catch {
    $denied = $true
}

if (-not $denied) {
    throw 'DUPLICATE_JOBS_ACCEPTED'
}

Write-Host 'PASS=DUPLICATE_JOBS_DENIED'

Write-Host '=== INCOMPLETE JOB PAGINATION ==='

$global:jobsJson = New-JobsJson -Jobs @($validJob) -Total 2

$denied = $false
try {
    $null = Invoke-BindingReader
}
catch {
    $denied = $true
}

if (-not $denied) {
    throw 'INCOMPLETE_JOBS_ACCEPTED'
}

Write-Host 'PASS=INCOMPLETE_PAGINATION_DENIED'

Write-Host '=== INVALID OPERATION ID ==='

$global:jobsJson = New-JobsJson -Jobs @($validJob) -Total 1

$denied = $false
try {
    $null = Invoke-BindingReader -Operation 'not-a-uuid'
}
catch {
    $denied = $true
}

if (-not $denied) {
    throw 'INVALID_OPERATION_ACCEPTED'
}

Write-Host 'PASS=INVALID_OPERATION_DENIED'

Write-Host '=== STRUCTURED EVIDENCE JSON ==='

$global:jobsJson = New-JobsJson -Jobs @($validJob) -Total 1
$global:callCount = 0

$lines = @(
    & $reader -RunId 123 `
        -OperationId $global:op `
        -RequestId $global:req `
        -EmitEvidenceJson
)

if ($global:callCount -ne 3) {
    throw 'STRUCTURED_EVIDENCE_CALL_COUNT_INVALID'
}

$evidenceLines = @(
    $lines | Where-Object {
        $_ -is [string] -and
        $_.StartsWith('EVIDENCE_JSON=')
    }
)

if ($evidenceLines.Count -ne 1) {
    throw 'STRUCTURED_EVIDENCE_RECORD_COUNT_INVALID'
}

$record = ConvertFrom-Json `
    -InputObject $evidenceLines[0].Substring(14) `
    -Depth 40

if (
    $record.schema -cne 'phase-c-github-evidence-v1' -or
    $record.operationId -cne $global:op -or
    $record.requestId -cne $global:req -or
    $record.runId -ne 123 -or
    $record.run.id -ne 123 -or
    $record.job.name -cne $global:jobName -or
    $record.job.run_id -ne 123 -or
    @($record.history).Count -ne 1 -or
    $record.executionAuthorized -ne $false -or
    $record.trustedIssuerConnected -ne $false
) {
    throw 'STRUCTURED_EVIDENCE_CONTRACT_INVALID'
}

Assert-Line $lines 'AZURE_JOB_CREATION_AUTHORIZED=False'
Assert-Line $lines 'NO_EXECUTION=True'

Write-Host 'PASS=STRUCTURED_EVIDENCE_NONAUTHORIZING'

Write-Host '=== STRUCTURED OUTPUT REQUIRES BOTH IDENTIFIERS ==='

$denied = $false

try {
    $null = & $reader -RunId 123 -EmitEvidenceJson
}
catch {
    $denied = $true
}

if (-not $denied) {
    throw 'UNBOUND_STRUCTURED_EVIDENCE_ACCEPTED'
}

Write-Host 'PASS=UNBOUND_STRUCTURED_EVIDENCE_DENIED'

Write-Host '=== MISMATCHED JOB CANNOT EMIT EVIDENCE ==='

$global:jobsJson = New-JobsJson -Jobs @(
    @{
        run_id = 123
        name = 'DISABLED operation=wrong request=wrong'
    }
) -Total 1

$denied = $false
$emitted = @()

try {
    $emitted = @(
        & $reader -RunId 123 `
            -OperationId $global:op `
            -RequestId $global:req `
            -EmitEvidenceJson
    )
}
catch {
    $denied = $true
}

if (-not $denied -or
    @($emitted | Where-Object {
        $_ -is [string] -and
        $_.StartsWith('EVIDENCE_JSON=')
    }).Count -ne 0) {
    throw 'MISMATCHED_JOB_EVIDENCE_EMITTED'
}

Write-Host 'PASS=MISMATCHED_JOB_EVIDENCE_DENIED'
Write-Host '=== FINAL TEST RESULT ==='
Write-Host 'ALL_FIVE_JOB_BINDING_TESTS_PASSED=True'
Write-Host 'SYNTHETIC_GITHUB_RESPONSES_ONLY=True'
Write-Host 'NO_LIVE_GITHUB_REQUESTS=True'
Write-Host 'NO_AZURE_CALLS=True'
