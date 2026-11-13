[CmdletBinding()]
param(
    [switch]$Execute,
    [switch]$Observe
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# E156 cloud watchdog v1:
# Read-only observation. No cleanup execution or scheduling.

$subscription = 'fbafd6e4-21ad-41d9-8f98-091c3c73ded2'
$rg = 'rg-hope-ai-api-staging'
$account = 'aa-hope-e156-cleanup'
$runbooks = @(
    'Remove-HopeE156TemporaryNetwork-v14'
)

function Get-E156CloudCleanupJobs {
    [CmdletBinding()]
    param()

    # Authenticate using Azure Automation's managed identity.
    $null = Connect-AzAccount -Identity -ErrorAction Stop

    $context = Get-AzContext

    if ($null -eq $context -or
        $context.Subscription.Id -ne $subscription -or
        $context.Tenant.Id -ne '783ef4b1-7e96-4a71-80dd-06865b015da9') {
        throw 'CLOUD_IDENTITY_CONTEXT_NOT_VERIFIED'
    }

    $base = "/subscriptions/$subscription/resourceGroups/$rg/providers/Microsoft.Automation/automationAccounts/$account/jobs"

    $uri = "$base`?api-version=2024-10-23"
    $results = @()
    $visited = [System.Collections.Generic.HashSet[string]]::new()

    while (-not [string]::IsNullOrWhiteSpace($uri)) {
        if (-not $visited.Add($uri)) {
            throw 'JOB_PAGINATION_CYCLE'
        }

        if ($visited.Count -gt 100) {
            throw 'JOB_PAGINATION_LIMIT'
        }

        # Restrict requests to this exact Automation account.
        $allowedPrefix = "https://management.azure.com$base"

        $absoluteUri = if ($uri.StartsWith('/')) {
            "https://management.azure.com$uri"
        }
        else {
            $uri
        }

        if (-not $absoluteUri.StartsWith(
            "$allowedPrefix`?",
            [StringComparison]::OrdinalIgnoreCase
        )) {
            throw 'UNEXPECTED_JOB_INVENTORY_URI'
        }

        $response = Invoke-AzRestMethod `
            -Method GET `
            -Uri $absoluteUri `
            -ErrorAction Stop

        if ([int]$response.StatusCode -ne 200) {
            throw 'JOB_INVENTORY_HTTP_FAILURE'
        }

        $body = $response.Content | ConvertFrom-Json

        $results += @($body.value | Where-Object {
            $null -ne $_ -and
            $_.properties.runbook.name -in $runbooks
        })

        $uri = [string](& { $p = $body.PSObject.Properties['nextLink']; if ($null -ne $p) { $p.Value } })
    }

    return $results
}

function Get-E156RecoveryClassification {
    [CmdletBinding()]
    param(
        [object[]]$Jobs
    )

    if (@($Jobs).Count -eq 0) {
        return 'NO_CLEANUP_JOB_FOUND'
    }

    $statuses = @(
        $Jobs | ForEach-Object {
            [string]$_.properties.status
        }
    )

    if (@($statuses | Where-Object {
        $_ -in @(
            'New', 'Activating', 'Queued', 'Running',
            'Resuming', 'Stopping', 'Suspended'
        )
    }).Count -gt 0) {
        return 'ACTIVE_OR_UNCERTAIN_JOB_BLOCK'
    }

    if (@($statuses | Where-Object {
        $_ -in @('Failed', 'Stopped')
    }).Count -gt 0) {
        return 'RECOVERY_REVIEW_REQUIRED'
    }

    if (@($statuses | Where-Object {
        $_ -notin @(
            'Completed', 'Failed', 'Stopped',
            'New', 'Activating', 'Queued', 'Running',
            'Resuming', 'Stopping', 'Suspended'
        )
    }).Count -gt 0) {
        return 'UNKNOWN_JOB_STATE_BLOCK'
    }

    return 'VERIFY_RESOURCE_ABSENCE_REQUIRED'
}

# Cleanup and recovery execution are prohibited in every mode.
if ($Execute) {
    throw 'E156_WATCHDOG_CLOUD_EXECUTION_DISABLED'
}

if (-not $Observe) {
    Write-Output 'E156_WATCHDOG_MODE=DEFAULT_DENY'
    Write-Output 'CLOUD_REQUESTS=False'
    Write-Output 'RECOVERY_EXECUTION=False'
    return
}

# Observation uses only managed-identity authentication
# and ARM GET requests.
# The cloud identity must separately possess read permission.
$jobs = @(Get-E156CloudCleanupJobs)

$classification = Get-E156RecoveryClassification -Jobs $jobs

Write-Output 'E156_WATCHDOG_MODE=READ_ONLY_OBSERVATION'
Write-Output "CLEANUP_JOB_COUNT=$($jobs.Count)"
Write-Output "RECOVERY_CLASSIFICATION=$classification"
Write-Output 'RECOVERY_EXECUTION=False'
Write-Output 'CLEANUP_EXECUTION=False'