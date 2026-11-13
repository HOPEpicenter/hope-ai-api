param(
    [switch]$Inspect
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

# Phase C isolated acceptance scope only.
# Read-only verification; no cleanup or execution authority.

$ExpectedSubscription = 'fbafd6e4-21ad-41d9-8f98-091c3c73ded2'
$ResourceGroup = 'rg-hope-ai-api-staging'
$VmName = 'vm-hope-c6-acceptance'

if (-not $Inspect) {
    Write-Output 'RECOVERY_INSPECTION=DEFAULT_DISABLED'
    exit 2
}

try {
    $account = & az account show --output json 2>$null

    if ($LASTEXITCODE -ne 0 -or -not $account) {
        throw 'ACCOUNT_UNAVAILABLE'
    }

    $accountData = $account | ConvertFrom-Json

    if ([string]$accountData.id -cne $ExpectedSubscription) {
        throw 'SUBSCRIPTION_MISMATCH'
    }

    $vmJson = & az vm get-instance-view `
        --subscription $ExpectedSubscription `
        --resource-group $ResourceGroup `
        --name $VmName `
        --output json 2>$null

    if ($LASTEXITCODE -ne 0 -or -not $vmJson) {
        throw 'VM_STATE_UNAVAILABLE'
    }

    $vm = $vmJson | ConvertFrom-Json

    $statuses = @()

    $rootStatuses = $vm.PSObject.Properties['statuses']
    $instanceView = $vm.PSObject.Properties['instanceView']

    if ($null -ne $rootStatuses -and
        $null -ne $rootStatuses.Value) {
        $statuses = @($rootStatuses.Value)
    }
    elseif ($null -ne $instanceView -and
            $null -ne $instanceView.Value) {

        $nestedStatuses = $instanceView.Value.PSObject.Properties['statuses']

        if ($null -ne $nestedStatuses -and
            $null -ne $nestedStatuses.Value) {
            $statuses = @($nestedStatuses.Value)
        }
    }

    $powerStates = @(
        $statuses |
            Where-Object {
                [string]$_.code -like 'PowerState/*'
            } |
            ForEach-Object {
                [string]$_.code
            }
    )

    $vmDeallocated = (
        $powerStates.Count -eq 1 -and
        $powerStates[0] -ceq 'PowerState/deallocated'
    )

    $commandsJson = & az vm run-command list `
        --subscription $ExpectedSubscription `
        --resource-group $ResourceGroup `
        --vm-name $VmName `
        --output json 2>$null

    if ($LASTEXITCODE -ne 0 -or -not $commandsJson) {
        throw 'RUN_COMMAND_INVENTORY_UNAVAILABLE'
    }

    $commands = $commandsJson | ConvertFrom-Json
    $commandCount = @($commands).Count

    Write-Output 'APPROVED_SUBSCRIPTION_VERIFIED=True'
    Write-Output "VM_DEALLOCATED=$vmDeallocated"
    Write-Output "MANAGED_RUN_COMMAND_COUNT=$commandCount"

    $commandsEmpty = ($commandCount -eq 0)
    Write-Output "MANAGED_RUN_COMMAND_INVENTORY_EMPTY=$commandsEmpty"

    if ($vmDeallocated -and $commandsEmpty) {
        Write-Output 'RECOVERY_STATE=VM_BASELINE_VERIFIED'
        Write-Output 'FULL_TRANSACTION_CLEANUP_VERIFIED=False'
        exit 0
    }

    Write-Output 'RECOVERY_STATE=REQUIRES_REVIEW'
    exit 2
}
catch {
    # Do not print exception messages or raw Azure responses.
    Write-Output 'RECOVERY_STATE=INSPECTION_UNAVAILABLE'
    exit 2
}