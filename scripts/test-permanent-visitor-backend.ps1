# Permanent visitor regressions: no live-service credentials or shared emulator.
& {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $PSNativeCommandUseErrorActionPreference = $true
    $root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $tests = @(
        'tests/authorization/permanentVisitReconciliationAuditHttp.test.ts'
        'tests/authorization/permanentVisitReconciliationHttp.test.ts'
        'tests/authorization/permanentVisitRecoveryDiscoveryHttp.test.ts'
        'tests/authorization/permanentVisitRecoveryHttp.test.ts'
        'tests/authorization/registrationAlternateEventConsent.test.ts'
        'tests/authorization/registrationContactCommandConsent.test.ts'
        'tests/authorization/visitorRegistrationHistoryHttp.test.ts'
        'tests/permanentPublicVisitQuotaCleanup.test.ts'
        'tests/permanentPublicVisitRequestBudget.test.ts'
        'tests/visitorPermanentAdmissionEvent.test.ts'
        'tests/visitorPermanentCalendarRuntime.test.ts'
        'tests/visitorPermanentCanonicalReceipt.test.ts'
        'tests/visitorPermanentDefaultRuntime.test.ts'
        'tests/visitorPermanentPublicRegistration.test.ts'
        'tests/visitorPermanentPublicSessionHttp.test.ts'
        'tests/visitorPermanentPublicVisitEvent.test.ts'
        'tests/visitorPermanentPublicVisitSession.test.ts'
        'tests/visitorPermanentQrAdmission.test.ts'
        'tests/visitorPermanentQrGrant.test.ts'
        'tests/visitorPermanentRegistrationAdapter.test.ts'
        'tests/visitorPermanentStaffConsentGuard.test.ts'
        'tests/visitorRegistrationHistory.test.ts'
        'tests/visitors/createVisitorEvent.test.ts'
        'tests/visitors/listApprovedVisitorEvents.test.ts'
        'tests/visitors/patchVisitorEventHttp.test.ts'
        'tests/visitors/postVisitorEventAdminBoundary.test.ts'
        'tests/visitors/postVisitorEventHttp.test.ts'
        'tests/visitors/prepareVisitorFamilyAttendance.test.ts'
        'tests/visitors/recordVisitorFamilyAttendance.test.ts'
        'tests/visitors/recordVisitorFamilyCheckIn.test.ts'
        'tests/visitors/resolveVisitorEventContext.test.ts'
        'tests/visitors/updateVisitorEvent.test.ts'
        'tests/visitors/validateVisitorFamily.test.ts'
        'tests/visitors/visitorEventTableWriter.test.ts'
        'tests/visitors/visitorEventUpdateRepository.test.ts'
        'tests/visitors/visitorFamilyHttpBoundary.test.ts'
    )
    $storageTests = @{
        'tests/authorization/permanentVisitReconciliationHttp.test.ts' = 'hopevisitor72'
        'tests/visitorPermanentCalendarRuntime.test.ts' = 'hopevisitor72'
        'tests/visitorPermanentDefaultRuntime.test.ts' = 'hopevisitor72'
        'tests/visitorPermanentCanonicalReceipt.test.ts' = 'hopevisitor91'
        'tests/visitorPermanentPublicSessionHttp.test.ts' = 'hopevisitor91'
    }
    $temp = Join-Path $root ('node_modules/.hope-visitor-backend-ci-' + [guid]::NewGuid().ToString('N'))
    $build = Join-Path $temp 'build'
    $node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $azurite = Join-Path $root 'node_modules/azurite/dist/src/table/main.js'
    $saved = @{}
    $settings = @{
        HOPE_API_KEY = 'synthetic-ci-staff-key'
        FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = $null
        HOPE_ADMIN_API_KEY = 'synthetic-ci-admin-key'
        HOPE_ADMIN_STAFF_IDS = 'synthetic-ci-admin'
        HOPE_PERMANENT_VISIT_BRIDGE_KEY = 'synthetic-ci-bridge-key'
        HOPE_PERMANENT_VISIT_SESSION_SECRET = 'synthetic-ci-session-secret'
        HOPE_PERMANENT_VISIT_CLAIM_SECRET = 'synthetic-ci-claim-secret'
        HOPE_TABLE_AUTH_MODE = 'connection-string'
        VISITORS_TABLE = 'Visitors'
        AZURITE_ACCOUNTS = $null
        STORAGE_CONNECTION_STRING = $null
        AzureWebJobsStorage = $null
        HOPE_TABLE_ENDPOINT = $null
        HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID = $null
        HOPE_VISITOR_57_LOCAL_ACCEPTANCE = $null
        HOPE_VISITOR_91_LOCAL_CONNECTION = $null
        HOPE_VISITOR_91_LOCAL_PORT = $null
        HOPE_VISITOR_72_LOCAL_RUNTIME = $null
        HOPE_VISITOR_72_ISOLATED_PORT = $null
        APPLICATIONINSIGHTS_CONNECTION_STRING = $null
        APPINSIGHTS_INSTRUMENTATIONKEY = $null
        OTEL_SDK_DISABLED = 'true'
    }
    function Set-LocalConnection([string]$account, [string]$key, [int]$port) {
        $endpoint = "http://127.0.0.1:$port/$account"
        $connection = "DefaultEndpointsProtocol=http;AccountName=$account;AccountKey=$key;TableEndpoint=$endpoint;BlobEndpoint=$endpoint;QueueEndpoint=$endpoint"
        $env:STORAGE_CONNECTION_STRING = $connection
        $env:AzureWebJobsStorage = $connection
        return $connection
    }
    function Reset-TestStorageEnvironment {
        foreach ($name in @('AZURITE_ACCOUNTS','HOPE_VISITOR_57_LOCAL_ACCEPTANCE','HOPE_VISITOR_91_LOCAL_CONNECTION','HOPE_VISITOR_91_LOCAL_PORT','HOPE_VISITOR_72_LOCAL_RUNTIME','HOPE_VISITOR_72_ISOLATED_PORT')) {
            [Environment]::SetEnvironmentVariable($name, $null, 'Process')
        }
        $key = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
        $null = Set-LocalConnection 'hopevisitorci' $key 1
    }
    function Invoke-RequiredTest([string]$file) {
        $target = Join-Path $build ($file -replace '\.ts$', '.js')
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "MISSING_COMPILED_TEST=$file" }
        Write-Host "=== REQUIRED_TEST=$file ==="
        # Per-suite synthetic settings from the original acceptance contracts.
        # Never propagate the enabled consent flag into another test process.
        $fixtureSettings = @{}
        switch ($file) {
            'tests/authorization/registrationAlternateEventConsent.test.ts' {
                $fixtureSettings = @{
                    HOPE_API_KEY = 'synthetic-step105-staff-key'
                    FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = 'true'
                }
            }
            'tests/authorization/registrationContactCommandConsent.test.ts' {
                $fixtureSettings = @{
                    HOPE_API_KEY = 'synthetic-step104-staff-key'
                    FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = 'true'
                }
            }
        }
        $prior = @{}
        try {
            foreach ($name in $fixtureSettings.Keys) {
                $prior[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
                [Environment]::SetEnvironmentVariable($name, $fixtureSettings[$name], 'Process')
            }
            # Capture the TAP report even when the test process fails.
            $PSNativeCommandUseErrorActionPreference = $false
            $result = @(& $node --test --test-reporter=tap $target)
            $exitCode = $LASTEXITCODE
            $result | ForEach-Object { Write-Host $_ }
            if ($exitCode -ne 0) { throw "REQUIRED_TEST_EXIT_FAILED=$file; EXIT=$exitCode" }
        } finally {
            foreach ($name in $prior.Keys) {
                [Environment]::SetEnvironmentVariable($name, $prior[$name], 'Process')
            }
        }
        $counts = @{}
        foreach ($line in $result) {
            if ($line -match '^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$') { $counts[$Matches[1]] = [int]$Matches[2] }
        }
        foreach ($name in @('tests','pass','fail','cancelled','skipped','todo')) {
            if (-not $counts.ContainsKey($name)) { throw "TEST_SUMMARY_MISSING=$file/$name" }
        }
        if ($counts.tests -lt 1 -or $counts.pass -ne $counts.tests -or $counts.fail -ne 0 -or $counts.cancelled -ne 0 -or $counts.skipped -ne 0 -or $counts.todo -ne 0) { throw "REQUIRED_TEST_NOT_FULLY_EXECUTED=$file" }
        return [int]$counts.pass
    }
    Push-Location $root
    try {
        foreach ($name in $settings.Keys) {
            $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
        }
        Reset-TestStorageEnvironment
        if (-not (Test-Path -LiteralPath $azurite -PathType Leaf)) { throw 'LOCKED_AZURITE_DEPENDENCY_REQUIRED' }
        foreach ($file in $tests) {
            if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "MISSING_REQUIRED_TEST=$file" }
        }
        New-Item -ItemType Directory -Path $build -Force | Out-Null
        & $node node_modules/typescript/bin/tsc --target ES2022 --module commonjs --moduleResolution node --strict --skipLibCheck --esModuleInterop --types node --noEmitOnError --rootDir $root --outDir $build @tests
        $total = 0
        foreach ($file in $tests) {
            if (-not $storageTests.ContainsKey($file)) {
                $total += Invoke-RequiredTest $file
                continue
            }
            # Every storage-aware suite has its own emulator, account key, and directory.
            $owned = Join-Path $temp ('storage-' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $owned | Out-Null
            $storageProcess = $null
            try {
                $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
                try { $listener.Start(); $port = $listener.LocalEndpoint.Port } finally { $listener.Stop() }
                if ($port -eq 10002) { throw 'INDEPENDENT_STORAGE_PORT_REQUIRED' }
                $account = $storageTests[$file]
                $key = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
                $env:AZURITE_ACCOUNTS = "${account}:$key"
                $connection = Set-LocalConnection $account $key $port
                if ($account -eq 'hopevisitor91') {
                    $env:HOPE_VISITOR_57_LOCAL_ACCEPTANCE = 'true'
                    $env:HOPE_VISITOR_91_LOCAL_CONNECTION = $connection
                    $env:HOPE_VISITOR_91_LOCAL_PORT = "$port"
                } else {
                    $env:HOPE_VISITOR_72_LOCAL_RUNTIME = 'true'
                    $env:HOPE_VISITOR_72_ISOLATED_PORT = "$port"
                }
                $storageProcess = Start-Process -FilePath $node -ArgumentList @(
                    "`"$azurite`"", '--tableHost', '127.0.0.1', '--tablePort', "$port",
                    '--location', "`"$owned`"", '--silent', '--disableTelemetry'
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
                Write-Host 'DISPOSABLE_LOOPBACK_STORAGE_READY=True'
                $total += Invoke-RequiredTest $file
            } finally {
                if ($null -ne $storageProcess) {
                    $storageProcess.Refresh()
                    if (-not $storageProcess.HasExited) { $storageProcess.Kill($true); $storageProcess.WaitForExit() }
                    $storageProcess.Dispose()
                }
                Reset-TestStorageEnvironment
            }
        }
        Write-Output 'THIRTY_SIX_REQUIRED_BACKEND_TEST_FILES_PASSED=True'
        Write-Output "BACKEND_CI_FOCUSED_PASS_COUNT=$total"
        Write-Output 'FIVE_ISOLATED_STORAGE_TEST_FILES_PASSED=True'
        Write-Output 'NO_REQUIRED_TEST_SKIPPED=True'
    } finally {
        foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
        Pop-Location
    }
}
