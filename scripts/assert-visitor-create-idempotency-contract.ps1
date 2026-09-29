param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [Parameter(Mandatory=$true)]$Condition,
    [Parameter(Mandatory=$true)][string]$Message
  )

  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

$ApiBase = $BaseUrl.TrimEnd("/")
if ($ApiBase -notmatch "/api$") {
  $ApiBase = "$ApiBase/api"
}

$headers = @{}
if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

$email = "visitor-create-contract+$([Guid]::NewGuid().ToString('N'))@example.com"
$initialPhone = "555-$((Get-Random -Minimum 1000 -Maximum 9999))"

$requestBody = @{
  name = "Visitor Create Contract"
  email = $email
  phone = $initialPhone
} | ConvertTo-Json

Write-Host "=== ASSERT: Canonical visitor creation semantics ==="
Write-Host "ApiBase=$ApiBase"
Write-Host "Email=$email"

$firstResponse = Invoke-WebRequest `
  -Method Post `
  -Uri "$ApiBase/visitors" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $requestBody `
  -SkipHttpErrorCheck

Assert-True `
  ([int]$firstResponse.StatusCode -eq 201) `
  "First POST /visitors should return HTTP 201 but returned $([int]$firstResponse.StatusCode)."

$firstBody = $firstResponse.Content | ConvertFrom-Json

Assert-True `
  ($firstBody.ok -eq $true) `
  "First POST /visitors should return ok=true."

$firstVisitorId = [string]$firstBody.visitorId

Assert-True `
  (-not [string]::IsNullOrWhiteSpace($firstVisitorId)) `
  "First POST /visitors should return a non-empty visitorId."

$secondResponse = Invoke-WebRequest `
  -Method Post `
  -Uri "$ApiBase/visitors" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $requestBody `
  -SkipHttpErrorCheck

Assert-True `
  ([int]$secondResponse.StatusCode -eq 200) `
  "Duplicate POST /visitors should return HTTP 200 but returned $([int]$secondResponse.StatusCode)."

$secondBody = $secondResponse.Content | ConvertFrom-Json

Assert-True `
  ($secondBody.ok -eq $true) `
  "Duplicate POST /visitors should return ok=true."

$secondVisitorId = [string]$secondBody.visitorId

Assert-True `
  (-not [string]::IsNullOrWhiteSpace($secondVisitorId)) `
  "Duplicate POST /visitors should return a non-empty visitorId."

Assert-True `
  ($secondVisitorId -eq $firstVisitorId) `
  "Duplicate POST /visitors should return the canonical visitorId from the first request."

$detailResponse = Invoke-WebRequest `
  -Method Get `
  -Uri "$ApiBase/visitors/$firstVisitorId" `
  -Headers $headers `
  -SkipHttpErrorCheck

Assert-True `
  ([int]$detailResponse.StatusCode -eq 200) `
  "GET /visitors/{visitorId} should return HTTP 200 but returned $([int]$detailResponse.StatusCode)."

$detailBody = $detailResponse.Content | ConvertFrom-Json

$visitor = $detailBody

if (
  $detailBody.PSObject.Properties.Name -contains "visitor" -and
  $null -ne $detailBody.visitor
) {
  $visitor = $detailBody.visitor
} elseif (
  $detailBody.PSObject.Properties.Name -contains "item" -and
  $null -ne $detailBody.item
) {
  $visitor = $detailBody.item
}

$detailVisitorId = [string]$visitor.visitorId
$detailEmail = [string]$visitor.email

Assert-True `
  ($detailVisitorId -eq $firstVisitorId) `
  "GET /visitors/{visitorId} should return the canonical visitorId."

Assert-True `
  ($detailEmail -eq $email) `
  "GET /visitors/{visitorId} should return the submitted email."

function New-Visitor {
  param([hashtable]$Body)

  $response = Invoke-WebRequest `
    -Method Post `
    -Uri "$ApiBase/visitors" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json) `
    -SkipHttpErrorCheck

  return [pscustomobject]@{
    Status = [int]$response.StatusCode
    Body = ($response.Content | ConvertFrom-Json)
  }
}

$phoneDigits = "201555$((Get-Random -Minimum 1000 -Maximum 9999))"
$phone = "($($phoneDigits.Substring(0, 3))) $($phoneDigits.Substring(3, 3))-$($phoneDigits.Substring(6, 4))"
$phoneFirst = New-Visitor @{ name = "Phone Only Visitor"; phone = $phone }
Assert-True ($phoneFirst.Status -eq 201) "Phone-only creation should return HTTP 201."
$phoneSecond = New-Visitor @{ name = "Phone Only Retry"; phone = "$($phoneDigits.Substring(0, 3))-$($phoneDigits.Substring(3, 3))-$($phoneDigits.Substring(6, 4))" }
Assert-True ($phoneSecond.Status -eq 200) "Formatting-equivalent phone retry should return HTTP 200."
Assert-True ([string]$phoneSecond.Body.visitorId -eq [string]$phoneFirst.Body.visitorId) "Formatting-equivalent phone retry should reuse visitorId."
$junkPhone = New-Visitor @{ name = "Junk Phone Visitor"; phone = "abc" }
Assert-True ($junkPhone.Status -eq 400) "Alphabetic phone input without email should return HTTP 400."

$dualEmail = "visitor-dual-$([Guid]::NewGuid().ToString('N'))@example.com"
$dualDigits = "202555$((Get-Random -Minimum 1000 -Maximum 9999))"
$dualPhone = "$($dualDigits.Substring(0, 3)) $($dualDigits.Substring(3, 3)) $($dualDigits.Substring(6, 4))"
$dualFirst = New-Visitor @{ name = "Dual Identity Visitor"; email = $dualEmail; phone = $dualPhone }
Assert-True ($dualFirst.Status -eq 201) "Email-plus-phone creation should return HTTP 201."
$dualByEmail = New-Visitor @{ name = "Dual Email Retry"; email = $dualEmail }
$dualByPhone = New-Visitor @{ name = "Dual Phone Retry"; phone = "$($dualDigits.Substring(0, 3))-$($dualDigits.Substring(3, 3))-$($dualDigits.Substring(6, 4))" }
Assert-True ($dualByEmail.Status -eq 200) "Dual visitor email retry should return HTTP 200."
Assert-True ($dualByPhone.Status -eq 200) "Dual visitor phone retry should return HTTP 200."
Assert-True ([string]$dualByEmail.Body.visitorId -eq [string]$dualFirst.Body.visitorId) "Dual visitor email index should resolve to the created visitor."
Assert-True ([string]$dualByPhone.Body.visitorId -eq [string]$dualFirst.Body.visitorId) "Dual visitor phone index should resolve to the created visitor."

$missing = New-Visitor @{ name = "Missing Contact Visitor" }
Assert-True ($missing.Status -eq 400) "Missing email and phone should return HTTP 400."
$blank = New-Visitor @{ name = "Blank Contact Visitor"; email = "  "; phone = " ( ) - " }
Assert-True ($blank.Status -eq 400) "Blank email and phone should return HTTP 400."
$invalidEmail = New-Visitor @{ name = "Invalid Email Visitor"; email = "not-an-email"; phone = "555-0199" }
Assert-True ($invalidEmail.Status -eq 400) "Invalid supplied email should return HTTP 400 even with a phone."

$sameEmail = "visitor-same-$([Guid]::NewGuid().ToString('N'))@example.com"
$sameDigits = "203555$((Get-Random -Minimum 1000 -Maximum 9999))"
$samePhone = "$($sameDigits.Substring(0, 3))-$($sameDigits.Substring(3, 3))-$($sameDigits.Substring(6, 4))"
$sameFirst = New-Visitor @{ name = "Same Identity Visitor"; email = $sameEmail; phone = $samePhone }
$sameRetry = New-Visitor @{ name = "Same Identity Retry"; email = $sameEmail; phone = "$($sameDigits.Substring(0, 3)) $($sameDigits.Substring(3, 3)) $($sameDigits.Substring(6, 4))" }
Assert-True ($sameRetry.Status -eq 200) "Matching email and phone identities should return HTTP 200."
Assert-True ([string]$sameRetry.Body.visitorId -eq [string]$sameFirst.Body.visitorId) "Matching email and phone identities should reuse one visitor."

$emailReuse = "visitor-email-reuse-$([Guid]::NewGuid().ToString('N'))@example.com"
$emailOwner = New-Visitor @{ name = "Email Owner"; email = $emailReuse }
$emailReuseResult = New-Visitor @{ name = "Email Owner Retry"; email = $emailReuse; phone = "204-$((Get-Random -Minimum 1000 -Maximum 9999))" }
Assert-True ($emailReuseResult.Status -eq 200) "Existing email plus new phone should return HTTP 200."
Assert-True ([string]$emailReuseResult.Body.visitorId -eq [string]$emailOwner.Body.visitorId) "Existing email plus new phone should reuse the email visitor."

$phoneOwnerDigits = "205555$((Get-Random -Minimum 1000 -Maximum 9999))"
$phoneOwner = New-Visitor @{ name = "Phone Owner"; phone = "$($phoneOwnerDigits.Substring(0, 3))-$($phoneOwnerDigits.Substring(3, 3))-$($phoneOwnerDigits.Substring(6, 4))" }
$phoneReuseEmail = "visitor-phone-reuse-$([Guid]::NewGuid().ToString('N'))@example.com"
$phoneReuseResult = New-Visitor @{ name = "Phone Owner Retry"; email = $phoneReuseEmail; phone = "$($phoneOwnerDigits.Substring(0, 3)) $($phoneOwnerDigits.Substring(3, 3)) $($phoneOwnerDigits.Substring(6, 4))" }
Assert-True ($phoneReuseResult.Status -eq 200) "Existing phone plus new email should return HTTP 200."
Assert-True ([string]$phoneReuseResult.Body.visitorId -eq [string]$phoneOwner.Body.visitorId) "Existing phone plus new email should reuse the phone visitor."

$conflictEmail = "visitor-conflict-$([Guid]::NewGuid().ToString('N'))@example.com"
$conflictEmailOwner = New-Visitor @{ name = "Conflict Email Owner"; email = $conflictEmail }
$conflictDigits = "206555$((Get-Random -Minimum 1000 -Maximum 9999))"
$conflictPhoneOwner = New-Visitor @{ name = "Conflict Phone Owner"; phone = "$($conflictDigits.Substring(0, 3))-$($conflictDigits.Substring(3, 3))-$($conflictDigits.Substring(6, 4))" }
$conflict = New-Visitor @{ name = "Conflict Attempt"; email = $conflictEmail; phone = "$($conflictDigits.Substring(0, 3)) $($conflictDigits.Substring(3, 3)) $($conflictDigits.Substring(6, 4))" }
Assert-True ($conflict.Status -eq 409) "Email and phone belonging to different visitors should return HTTP 409."
Assert-True ([string]$conflict.Body.error -eq "VISITOR_IDENTIFIER_CONFLICT") "Identifier conflict should use the explicit conflict error."

$repositoryTest = @'
process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
const assert = require("assert");
const { TableClient } = require("@azure/data-tables");
const { AzureTableVisitorsRepository, normalizePhoneIdentifier } = require("./src/repositories/visitorsRepository");
const { getTableClient } = require("./src/storage/tableClient");

async function expectMissing(table, partitionKey, rowKey) {
  try {
    await table.getEntity(partitionKey, rowKey);
    throw new Error(`Expected missing ${partitionKey}/${rowKey}`);
  } catch (error) {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    const code = String(error?.code ?? "");
    assert(status === 404 || code === "ResourceNotFound", `Expected missing ${partitionKey}/${rowKey}`);
  }
}

(async () => {
  const table = await getTableClient("Visitors");
  const suffix = Date.now().toString();
  const staleVisitorId = `stale-phone-${suffix}`;
  const stalePhone = `555${suffix.slice(-7)}`;
  const stalePhoneKey = encodeURIComponent(stalePhone);
  const missingVisitorId = `missing-phone-${suffix}`;

  await table.createEntity({
    partitionKey: "VISITOR", rowKey: staleVisitorId, name: "Recovered Phone Visitor",
    phone: `(${stalePhone.slice(0, 3)}) ${stalePhone.slice(3, 6)}-${stalePhone.slice(6)}`,
    phoneCanonical: stalePhone, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  await table.createEntity({ partitionKey: "PHONE", rowKey: stalePhoneKey, visitorId: missingVisitorId, createdAt: new Date().toISOString() });

  const repository = new AzureTableVisitorsRepository();
  const recovered = await repository.create({ name: "Retry Recovered Phone", phone: stalePhone });
  assert.strictEqual(recovered.created, false, "Stale PHONE recovery must not create a duplicate");
  assert.strictEqual(recovered.visitor.visitorId, staleVisitorId, "Stale PHONE recovery must return the matching visitor");
  const repairedIndex = await table.getEntity("PHONE", stalePhoneKey);
  assert.strictEqual(repairedIndex.visitorId, staleVisitorId, "Stale PHONE index must be repaired");

  const legacyVisitorId = `legacy-phone-${suffix}`;
  const legacyPhone = `201555${suffix.slice(-4)}`;
  const legacyPhoneKey = encodeURIComponent(legacyPhone);
  await table.createEntity({
    partitionKey: "VISITOR", rowKey: legacyVisitorId, name: "Legacy Phone Visitor",
    phone: `(${legacyPhone.slice(0, 3)}) ${legacyPhone.slice(3, 6)}-${legacyPhone.slice(6)}`,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  const legacyRecovered = await repository.create({ name: "Legacy Phone Retry", phone: `${legacyPhone.slice(0, 3)}-${legacyPhone.slice(3, 6)}-${legacyPhone.slice(6)}` });
  assert.strictEqual(legacyRecovered.created, false, "Legacy phone recovery must not create a duplicate");
  assert.strictEqual(legacyRecovered.visitor.visitorId, legacyVisitorId, "Legacy phone recovery must return the existing visitor");
  const legacyEntity = await table.getEntity("VISITOR", legacyVisitorId);
  assert.strictEqual(legacyEntity.phoneCanonical, legacyPhone, "Legacy visitor must receive phoneCanonical backfill");
  const legacyIndex = await table.getEntity("PHONE", legacyPhoneKey);
  assert.strictEqual(legacyIndex.visitorId, legacyVisitorId, "Legacy PHONE index must be created for the existing visitor");

  const ambiguousPhone = `202555${suffix.slice(-4)}`;
  const ambiguousPhoneKey = encodeURIComponent(ambiguousPhone);
  const ambiguousVisitorA = `ambiguous-phone-a-${suffix}`;
  const ambiguousVisitorB = `ambiguous-phone-b-${suffix}`;
  await table.createEntity({
    partitionKey: "VISITOR", rowKey: ambiguousVisitorA, name: "Ambiguous Phone A",
    phone: `202-555-${ambiguousPhone.slice(6)}`,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  await table.createEntity({
    partitionKey: "VISITOR", rowKey: ambiguousVisitorB, name: "Ambiguous Phone B",
    phone: `202 555 ${ambiguousPhone.slice(6)}`,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  await assert.rejects(
    repository.create({ name: "Ambiguous Phone Retry", phone: ambiguousPhone }),
    /PHONE_IDENTITY_CONFLICT/
  );
  await expectMissing(table, "PHONE", ambiguousPhoneKey);
  const ambiguousRows = [];
  for await (const entity of table.listEntities({ queryOptions: { filter: "PartitionKey eq 'VISITOR'" } })) {
    if ([ambiguousVisitorA, ambiguousVisitorB].includes(entity.rowKey)) ambiguousRows.push(entity);
  }
  assert.strictEqual(ambiguousRows.length, 2, "Ambiguous legacy phone recovery must not create a third visitor");

  const originalCreateEntity = TableClient.prototype.createEntity;
  const failedEmail = `rollback-${suffix}@example.com`;
  const failedPhone = `555${(Number(suffix.slice(-6)) + 100000).toString().slice(-6)}`;
  const existingEmail = `existing-${suffix}@example.com`;
  const existing = await repository.create({ name: "Existing Reservation Owner", email: existingEmail });
  TableClient.prototype.createEntity = async function(entity, ...args) {
    if (entity?.partitionKey === "VISITOR" && entity?.emailLower === failedEmail) {
      throw new Error("INJECTED_VISITOR_WRITE_FAILURE");
    }
    return originalCreateEntity.call(this, entity, ...args);
  };
  try {
    await assert.rejects(
      repository.create({ name: "Rollback Failure", email: failedEmail, phone: failedPhone }),
      /INJECTED_VISITOR_WRITE_FAILURE/
    );
  } finally {
    TableClient.prototype.createEntity = originalCreateEntity;
  }
  await expectMissing(table, "EMAIL", encodeURIComponent(failedEmail));
  await expectMissing(table, "PHONE", encodeURIComponent(normalizePhoneIdentifier(failedPhone)));
  const existingIndex = await table.getEntity("EMAIL", encodeURIComponent(existingEmail));
  assert.strictEqual(existingIndex.visitorId, existing.visitor.visitorId, "Rollback must not delete an existing reservation");

  await table.deleteEntity("VISITOR", staleVisitorId);
  await table.deleteEntity("PHONE", stalePhoneKey);
  await table.deleteEntity("VISITOR", legacyVisitorId);
  await table.deleteEntity("PHONE", legacyPhoneKey);
  await table.deleteEntity("VISITOR", ambiguousVisitorA);
  await table.deleteEntity("VISITOR", ambiguousVisitorB);
  await table.deleteEntity("EMAIL", encodeURIComponent(existingEmail));
  console.log("OK: direct stale PHONE repair and reservation rollback checks passed");
})().catch((error) => { console.error(error); process.exit(1); });
'@

& node -r ts-node/register -e $repositoryTest
if ($LASTEXITCODE -ne 0) {
  throw "Direct local repository stale-index/rollback checks failed."
}

Write-Host `
  "OK: canonical visitor creation and idempotency contract passed. visitorId=$firstVisitorId" `
  -ForegroundColor Green