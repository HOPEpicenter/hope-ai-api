Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$reader = Join-Path $PSScriptRoot 'Read-PhaseCGitHubApproval-v1.ps1'

$global:runJson = '{"id":123,"path":".github/workflows/phase-c-protected-job-creation.yml","event":"workflow_dispatch","head_branch":"main","repository":{"full_name":"HOPEpicenter/hope-ai-api"}}'
$global:pagesJson = ''
$global:calls = 0

function gh {
    param(
        [Parameter(ValueFromRemainingArguments)]
        [string[]] $Arguments
    )

    $global:calls++
    $global:LASTEXITCODE = 0

    if ($Arguments[0] -cne 'api') {
        throw 'UNEXPECTED_GITHUB_COMMAND'
    }

    $endpoint = $Arguments[1]

    if ($endpoint -ceq 'repos/HOPEpicenter/hope-ai-api/actions/runs/123') {
        return $global:runJson
    }

    if ($endpoint -ceq 'repos/HOPEpicenter/hope-ai-api/actions/runs/123/approvals') {
        if ('--paginate' -cnotin $Arguments -or '--slurp' -cnotin $Arguments) {
            throw 'PAGINATION_FLAGS_MISSING'
        }
        return $global:pagesJson
    }

    throw 'UNEXPECTED_GITHUB_ENDPOINT'
}

function Invoke-TestReader {
    $global:calls = 0
    $output = @(& $reader -RunId 123)

    if ($global:calls -ne 2) {
        throw 'UNEXPECTED_GITHUB_CALL_COUNT'
    }

    return ,$output
}

function Assert-Line {
    param([string[]] $Output, [string] $Expected)

    if ($Expected -cnotin $Output) {
        throw "MISSING_EXPECTED_RESULT: $Expected"
    }
}

$approval = '{"state":"approved","user":{"login":"Hope-2018"},"environments":[{"name":"HOPE-Phase-C-Job-Creation"}]}'
$unrelated = '{"state":"approved","user":{"login":"other"},"environments":[{"name":"Other"}]}'
$rejection = '{"state":"rejected","user":{"login":"reviewer"},"environments":[{"name":"HOPE-Phase-C-Job-Creation"}]}'

Write-Host '=== MULTIPAGE APPROVAL ==='
$global:pagesJson = '[[' + $unrelated + '],[' + $approval + ']]'
$result = Invoke-TestReader
Assert-Line $result 'APPROVAL_HISTORY_RECORD_COUNT=2'
Assert-Line $result 'INDEPENDENT_APPROVAL_FOUND=True'
Assert-Line $result 'OPERATION_BOUND_AUTHORIZATION=False'
Assert-Line $result 'AZURE_JOB_CREATION_AUTHORIZED=False'
Write-Host 'PASS=MULTIPAGE_APPROVAL'

Write-Host '=== REJECTION ACROSS PAGES ==='
$global:pagesJson = '[[' + $approval + '],[' + $rejection + ']]'
$result = Invoke-TestReader
Assert-Line $result 'REJECTION_IN_HISTORY=True'
Assert-Line $result 'AZURE_JOB_CREATION_AUTHORIZED=False'
Write-Host 'PASS=REJECTION_ACROSS_PAGES'

Write-Host '=== MALFORMED PAGE ==='
$global:pagesJson = '[' + $approval + ']'
$denied = $false
try { $null = Invoke-TestReader } catch { $denied = $true }
if (-not $denied) { throw 'MALFORMED_PAGE_ACCEPTED' }
Write-Host 'PASS=MALFORMED_PAGE_DENIED'

Write-Host '=== MALFORMED RECORD ==='
$global:pagesJson = '[[{"state":"approved"}]]'
$denied = $false
try { $null = Invoke-TestReader } catch { $denied = $true }
if (-not $denied) { throw 'MALFORMED_RECORD_ACCEPTED' }
Write-Host 'PASS=MALFORMED_RECORD_DENIED'

Write-Host '=== EMPTY HISTORY ==='
$global:pagesJson = '[[]]'
$result = Invoke-TestReader
Assert-Line $result 'INDEPENDENT_APPROVAL_FOUND=False'
Assert-Line $result 'NO_EXECUTION=True'
Write-Host 'PASS=EMPTY_HISTORY_NONAUTHORIZING'

Write-Host '=== FINAL TEST RESULT ==='
Write-Host 'ALL_FIVE_PAGINATION_REGRESSIONS_PASSED=True'
Write-Host 'SYNTHETIC_GITHUB_RESPONSES_ONLY=True'
Write-Host 'NO_AZURE_CALLS=True'
