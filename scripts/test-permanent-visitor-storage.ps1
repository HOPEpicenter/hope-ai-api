# Required permanent visitor storage regressions; each suite owns a fresh emulator.
& {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $PSNativeCommandUseErrorActionPreference = $true
    $root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $cases = @(
        @{ File='tests/permanentPublicVisitQuotaCleanupStorage.test.cjs'; Account='hopevisitor93'; Prefix='HOPE_VISITOR_93'; Count=4 }
        @{ File='tests/permanentPublicVisitRequestStorage.test.cjs'; Account='hopevisitor88'; Prefix='HOPE_VISITOR_88'; Count=4 }
        @{ File='tests/visitorPermanentFollowupConsent.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=7 }
        @{ File='tests/visitorPermanentPublicAdmission.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=8 }
        @{ File='tests/visitorPermanentQrReservationStore.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=13 }
        @{ File='tests/visitorPermanentAtomicEnrollmentStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=3; Authority='true' }
        @{ File='tests/visitorPermanentConsentRepositoryStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=$null; Authority='true' }
        @{ File='tests/visitorPermanentConsentRuntimeStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=13; Authority='true' }
        @{ File='tests/visitorPermanentContactWriterHoldStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=14; Authority='true' }
        @{ File='tests/visitorPermanentLegacyConsentMigrationStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=$null; Authority='true' }
        @{ File='tests/visitorPermanentPreAttendanceWithdrawalStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=14; Authority='true' }
        @{ File='tests/visitorPermanentRegistrationConsentAdapterStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=$null; Authority='true' }
        @{ File='tests/visitorPermanentStaffConsentAuthorityStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=17; Authority='true' }
        @{ File='tests/visitorPermanentStaffContactIntentStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=$null; Authority='true' }
        @{ File='tests/visitorPermanentStaffOwnerClaimStorage.test.ts'; Account='hopevisitor133'; Prefix='HOPE_VISITOR_133'; Count=9; Authority='true' }
    )
    $temp = Join-Path $root ('node_modules/.hope-visitor-storage-ci-' + [guid]::NewGuid().ToString('N'))
    $build = Join-Path $temp 'build'
    $node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $azurite = Join-Path $root 'node_modules/azurite/dist/src/table/main.js'
    $settings = @{
        NODE_ENV = 'test'
        HOPE_API_KEY = 'synthetic-storage-ci-staff-key'
        HOPE_ADMIN_API_KEY = 'synthetic-storage-ci-admin-key'
        HOPE_PERMANENT_VISIT_BRIDGE_KEY = 'synthetic-storage-ci-bridge-key'
        HOPE_TABLE_AUTH_MODE = 'connection-string'
        VISITORS_TABLE = 'Visitors'
        HOPE_TABLE_ENDPOINT = $null
        HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID = $null
        APPLICATIONINSIGHTS_CONNECTION_STRING = $null
        APPINSIGHTS_INSTRUMENTATIONKEY = $null
        OTEL_SDK_DISABLED = 'true'
        FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = 'true'
        FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY = $null
        FEATURE_PERMANENT_VISITOR_ISOLATED_PILOT = $null
        FEATURE_PERMANENT_VISITOR_STAFF_CONSENT_DECISION = $null
        FEATURE_PERMANENT_PUBLIC_VISIT = $null
        HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER = $null
        FORMATION_EVENTS_TABLE = $null
        GLOBAL_TIMELINE_TABLE = $null
        AZURITE_ACCOUNTS = $null
        STORAGE_CONNECTION_STRING = $null
        AzureWebJobsStorage = $null
        HOPE_VISITOR_57_LOCAL_ACCEPTANCE = $null
    }
    foreach ($prefix in @('HOPE_VISITOR_88','HOPE_VISITOR_93','HOPE_VISITOR_133')) {
        foreach ($suffix in @('ACCEPTANCE','BUILD','CONNECTION','PORT')) {
            $settings["${prefix}_$suffix"] = $null
        }
    }
    $saved = @{}
    function Reset-StorageEnvironment {
        foreach ($name in $settings.Keys) {
            if ($name -like 'HOPE_VISITOR_*' -or $name -in @('AZURITE_ACCOUNTS','STORAGE_CONNECTION_STRING','AzureWebJobsStorage')) {
                [Environment]::SetEnvironmentVariable($name, $null, 'Process')
            }
        }
        $key = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
        $connection = "DefaultEndpointsProtocol=http;AccountName=hopevisitorci;AccountKey=$key;TableEndpoint=http://127.0.0.1:1/hopevisitorci;BlobEndpoint=http://127.0.0.1:1/hopevisitorci;QueueEndpoint=http://127.0.0.1:1/hopevisitorci"
        $env:STORAGE_CONNECTION_STRING = $connection
        $env:AzureWebJobsStorage = $connection
    }
    Push-Location $root
    try {
        foreach ($name in $settings.Keys) {
            $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
        }
        Reset-StorageEnvironment
        if (-not (Test-Path -LiteralPath $azurite -PathType Leaf)) { throw 'LOCKED_AZURITE_DEPENDENCY_REQUIRED' }
        foreach ($case in $cases) {
            if (-not (Test-Path -LiteralPath $case.File -PathType Leaf)) { throw "MISSING_REQUIRED_TEST=$($case.File)" }
        }
        $compile = @($cases | Where-Object { $_.File.EndsWith('.ts') } | ForEach-Object { $_.File })
        $compile += @('src/services/visitors/cleanupPermanentPublicVisitQuota.ts','src/services/visitors/reservePermanentPublicVisitRequest.ts')
        New-Item -ItemType Directory -Path $build -Force | Out-Null
        & $node node_modules/typescript/bin/tsc --target ES2022 --module commonjs --moduleResolution node --strict --skipLibCheck --esModuleInterop --types node --noEmitOnError --rootDir $root --outDir $build @compile
        $total = 0
        foreach ($case in $cases) {
            $file = $case.File

            # Keep existing legacy tests in their original mode.
            # Enable authority only for the corrective fixtures.
            if ($case.ContainsKey('Authority')) {
                $env:FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY = 'true'
                $env:FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = 'false'
                $env:HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER = '2020-01-01T00:00:00.000Z'
            } else {
                $env:FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY = $null
                $env:FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = 'true'
                $env:HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER = $null
            }

            $env:FORMATION_EVENTS_TABLE = "HopeCare$([guid]::NewGuid().ToString('N'))"
            $env:GLOBAL_TIMELINE_TABLE = "HopeTimeline$([guid]::NewGuid().ToString('N'))"
            $owned = Join-Path $temp ('storage-' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $owned | Out-Null
            $storageProcess = $null
            try {
                $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
                try { $listener.Start(); $port = $listener.LocalEndpoint.Port } finally { $listener.Stop() }
                if ($port -eq 10002) { throw 'INDEPENDENT_STORAGE_PORT_REQUIRED' }
                $account = $case.Account
                $key = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
                $env:AZURITE_ACCOUNTS = "${account}:$key"
                $endpoint = "http://127.0.0.1:$port/$account"
                $connection = "DefaultEndpointsProtocol=http;AccountName=$account;AccountKey=$key;TableEndpoint=$endpoint;BlobEndpoint=$endpoint;QueueEndpoint=$endpoint"
                $env:STORAGE_CONNECTION_STRING = $connection
                $env:AzureWebJobsStorage = $connection
                $prefix = $case.Prefix
                [Environment]::SetEnvironmentVariable("${prefix}_ACCEPTANCE", 'true', 'Process')
                [Environment]::SetEnvironmentVariable("${prefix}_BUILD", $build, 'Process')
                [Environment]::SetEnvironmentVariable("${prefix}_CONNECTION", $connection, 'Process')
                [Environment]::SetEnvironmentVariable("${prefix}_PORT", "$port", 'Process')
                if ($account -eq 'hopevisitor133') { $env:HOPE_VISITOR_57_LOCAL_ACCEPTANCE = 'true' }
                $storageProcess = Start-Process -FilePath $node -ArgumentList @(
                    "`"$azurite`"", '--tableHost', '127.0.0.1', '--tablePort', "$port",
                    '--location', "`"$owned`"", '--silent', '--disableTelemetry', '--skipApiVersionCheck'
                ) -RedirectStandardOutput (Join-Path $owned 'stdout.txt') -RedirectStandardError (Join-Path $owned 'stderr.txt') -PassThru
                $ready = $false
                for ($i = 0; $i -lt 80; $i++) {
                    $storageProcess.Refresh()
                    if ($storageProcess.HasExited) { throw 'OWNED_STORAGE_EXITED' }
                    $tcp = [Net.Sockets.TcpClient]::new()
                    try { $tcp.Connect('127.0.0.1', $port); $ready = $true }
                    catch { Start-Sleep -Milliseconds 250 }
                    finally { $tcp.Dispose() }
                    if ($ready) { break }
                }
                if (-not $ready) { throw 'ISOLATED_STORAGE_NOT_READY' }
                $storageProcess.Refresh()
                if ($storageProcess.HasExited) { throw 'OWNED_STORAGE_EXITED' }
                Write-Host 'DISPOSABLE_LOOPBACK_STORAGE_READY=True'
                if ($file.EndsWith('.ts')) { $target = Join-Path $build ($file -replace '\.ts$', '.js') }
                else { $target = Join-Path $root $file }
                if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "MISSING_TEST_TARGET=$file" }
                Write-Host "=== REQUIRED_STORAGE_TEST=$file ==="
                $PSNativeCommandUseErrorActionPreference = $false
                try {
                    $result = @(& $node --test --test-reporter=tap $target)
                    $exitCode = $LASTEXITCODE
                    $result | ForEach-Object { Write-Host $_ }
                    if ($exitCode -ne 0) { throw "REQUIRED_TEST_EXIT_FAILED=$file; EXIT=$exitCode" }
                } finally { $PSNativeCommandUseErrorActionPreference = $true }
                $counts = @{}
                foreach ($line in $result) {
                    if ($line -match '^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$') { $counts[$Matches[1]] = [int]$Matches[2] }
                }
                foreach ($name in @('tests','pass','fail','cancelled','skipped','todo')) {
                    if (-not $counts.ContainsKey($name)) { throw "TEST_SUMMARY_MISSING=$file/$name" }
                }
                if ($counts.tests -lt 1 -or ($null -ne $case.Count -and $counts.tests -ne $case.Count) -or $counts.pass -ne $counts.tests -or $counts.fail -ne 0 -or $counts.cancelled -ne 0 -or $counts.skipped -ne 0 -or $counts.todo -ne 0) { throw "REQUIRED_TEST_NOT_FULLY_EXECUTED=$file" }
                $total += [int]$counts.pass
            } finally {
                if ($null -ne $storageProcess) {
                    $storageProcess.Refresh()
                    if (-not $storageProcess.HasExited) { $storageProcess.Kill($true); $storageProcess.WaitForExit() }
                    $storageProcess.Dispose()
                }
                Reset-StorageEnvironment
            }
        }
        Write-Output 'ALL_REQUIRED_STORAGE_FIXTURES_PASSED=True'
        Write-Output "REMAINING_STORAGE_TEST_PASS_COUNT=$total"
        Write-Output 'NO_REQUIRED_TEST_SKIPPED=True'
    } finally {
        foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
        Pop-Location
    }
}
