param(
    [switch]$Inspect
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

# Phase C isolated scope only.
# Explicitly enabled read-only inspection.
# Never creates, deletes, or modifies Azure resources.
# Never establishes complete transaction cleanup.

$ExpectedSubscription = 'fbafd6e4-21ad-41d9-8f98-091c3c73ded2'
$ResourceGroup = 'rg-hope-ai-api-staging'

if (-not $Inspect) {
    Write-Output 'ROLE_INVENTORY_INSPECTION=DEFAULT_DISABLED'
    exit 2
}

Write-Output 'TEMPORARY_PERMISSIONS_REVOKED=NOT_VERIFIED'
Write-Output 'FULL_TRANSACTION_CLEANUP_VERIFIED=False'

try {
    $accountJson = & az account show --output json 2>$null

    if ($LASTEXITCODE -ne 0 -or -not $accountJson) {
        throw 'ACCOUNT_UNAVAILABLE'
    }

    $account = $accountJson | ConvertFrom-Json

    if ([string]$account.id -cne $ExpectedSubscription) {
        throw 'SUBSCRIPTION_MISMATCH'
    }

    $scope = "/subscriptions/$ExpectedSubscription/resourceGroups/$ResourceGroup"

    # Azure CLI performs pagination for this list operation.
    # This is a scoped inventory observation, not proof that
    # all temporary grants at every possible scope are absent.
    $inventoryJson = & az role assignment list `
        --subscription $ExpectedSubscription `
        --scope $scope `
        --all `
        --output json 2>$null

    if ($LASTEXITCODE -ne 0 -or -not $inventoryJson) {
        throw 'INVENTORY_QUERY_FAILED'
    }

    $inventory = $inventoryJson | ConvertFrom-Json

    if ($null -eq $inventory -or
        $inventory -isnot [array]) {
        throw 'INVALID_INVENTORY_SHAPE'
    }

    $count = @($inventory).Count

    Write-Output 'APPROVED_SUBSCRIPTION_VERIFIED=True'
    Write-Output 'ISOLATED_RESOURCE_GROUP_SCOPE=True'
    Write-Output "OBSERVED_ROLE_ASSIGNMENT_COUNT=$count"
    Write-Output 'ROLE_INVENTORY_STATE=OBSERVED_UNVERIFIED'

    exit 0
}
catch {
    # Never display raw Azure responses, role assignments,
    # principal identifiers, or exception details.
    Write-Output 'ROLE_INVENTORY_STATE=INSPECTION_UNAVAILABLE'
    exit 2
}
