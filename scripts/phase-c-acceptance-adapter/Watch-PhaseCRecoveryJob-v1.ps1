param(
    [switch]$Inspect,
    [string]$OperationId,
    [string]$JobId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Phase C read-only job observer.
# No recovery execution, scheduling, cleanup, or authorization.
# Caller-supplied job identifiers do not prove operation binding.

$Subscription = 'fbafd6e4-21ad-41d9-8f98-091c3c73ded2'
$ResourceGroup = 'rg-hope-ai-api-staging'
$AutomationAccount = 'aa-hope-e156-cleanup'

if (-not $Inspect) {
    Write-Output 'PHASE_C_CLOUD_OBSERVER=DEFAULT_DISABLED'
    exit 2
}

Write-Output 'RECOVERY_EXECUTION=DISABLED'
Write-Output 'JOB_OPERATION_BINDING=NOT_VERIFIED'
Write-Output 'FULL_TRANSACTION_CLEANUP_VERIFIED=False'

function Test-CanonicalUuid4 {
    param([object]$Value)

    if ($Value -isnot [string]) { return $false }

    $parsed = [guid]::Empty

    if (-not [guid]::TryParseExact($Value, 'D', [ref]$parsed)) {
        return $false
    }

    if ($parsed.ToString('D') -cne $Value) {
        return $false
    }

    return ($Value[14] -ceq '4' -and
        $Value[19] -cmatch '^[89ab]$')
}

if (-not (Test-CanonicalUuid4 $OperationId) -or
    -not (Test-CanonicalUuid4 $JobId)) {
    Write-Output 'JOB_OBSERVATION=INVALID_IDENTIFIERS'
    exit 2
}

try {
    # Requires a separately configured managed identity.
    # No interactive or credential-based fallback.
    Connect-AzAccount -Identity -ErrorAction Stop | Out-Null

    $context = Get-AzContext -ErrorAction Stop

    if ($null -eq $context -or
        [string]$context.Subscription.Id -cne $Subscription) {
        throw 'SUBSCRIPTION_MISMATCH'
    }

    $path = "/subscriptions/$Subscription" +
        "/resourceGroups/$ResourceGroup" +
        "/providers/Microsoft.Automation" +
        "/automationAccounts/$AutomationAccount" +
        "/jobs/$JobId?api-version=2024-10-23"

    $response = Invoke-AzRestMethod `
        -Method GET `
        -Path $path `
        -ErrorAction Stop

    if ($null -eq $response -or
        [int]$response.StatusCode -ne 200) {
        throw 'JOB_READ_UNAVAILABLE'
    }

    $job = $response.Content | ConvertFrom-Json

    $expectedId = $path.Split('?')[0]

    if ([string]$job.id -ine $expectedId) {
        throw 'JOB_IDENTITY_MISMATCH'
    }

    if ($null -eq $job.PSObject.Properties['properties']) {
        throw 'JOB_PROPERTIES_UNAVAILABLE'
    }

    $statusProperty = $job.properties.PSObject.Properties['status']

    if ($null -eq $statusProperty) {
        throw 'JOB_STATUS_UNAVAILABLE'
    }

    $status = [string]$statusProperty.Value

    $allowed = @(
        'New', 'Activating', 'Queued', 'Running',
        'Completed', 'Failed', 'Stopped', 'Suspended',
        'Stopping', 'Resuming'
    )

    if ($status -cnotin $allowed) {
        throw 'UNKNOWN_JOB_STATUS'
    }

    Write-Output "OBSERVED_JOB_STATE=$status"
    Write-Output 'JOB_OBSERVATION=UNBOUND_READ_ONLY'
    exit 0
}
catch {
    # No raw responses, exception details, or identifiers.
    Write-Output 'JOB_OBSERVATION=UNAVAILABLE'
    exit 2
}
