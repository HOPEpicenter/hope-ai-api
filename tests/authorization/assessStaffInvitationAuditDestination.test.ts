import assert from "node:assert/strict";

import {
  assessStaffInvitationAuditDestination
} from "../../src/services/staff/assessStaffInvitationAuditDestination";

const subscriptionId =
  "11111111-1111-4111-8111-111111111111";

const destination = {
  schemaVersion: 1,
  environment: "staging",
  subscriptionId,
  resourceGroup: "rg-hope-audit-staging",
  accountName: "hopesyntheticaudit",
  tableName: "HopeStaffInvitationAudit",
  accountResourceId:
    `/subscriptions/${subscriptionId}` +
    "/resourceGroups/rg-hope-audit-staging" +
    "/providers/Microsoft.Storage/storageAccounts/hopesyntheticaudit"
} as const;

const inspect = (
  candidate: unknown,
  expected: unknown = destination
) => assessStaffInvitationAuditDestination(candidate, expected);

function denied(value: ReturnType<typeof inspect>): void {
  assert.equal(Object.isFrozen(value), true);
  assert.equal(value.advisoryOnly, true);
  assert.equal(value.resourceIdentityVerified, false);
  assert.equal(value.leastPrivilegeVerified, false);
  assert.equal(value.auditDurabilityVerified, false);
  assert.equal(value.storageAccessPermitted, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.productionRolloutPermitted, false);
}

const matching = inspect({ ...destination });

assert.equal(
  matching.status,
  "configuration_matches_unverified"
);
denied(matching);

console.log("PASS matching staging configuration remains unverified");

for (const changes of [
  { accountName: "differentaccount" },
  { tableName: "OtherAuditTable" },
  { resourceGroup: "other-group" },
  { subscriptionId: "22222222-2222-4222-8222-222222222222" }
]) {
  const result = inspect({
    ...destination,
    ...changes,
    ...(changes.accountName ? {
      accountResourceId:
        destination.accountResourceId.replace(
          destination.accountName,
          changes.accountName
        )
    } : {}),
    ...(changes.resourceGroup ? {
      accountResourceId:
        destination.accountResourceId.replace(
          destination.resourceGroup,
          changes.resourceGroup
        )
    } : {}),
    ...(changes.subscriptionId ? {
      accountResourceId:
        destination.accountResourceId.replace(
          destination.subscriptionId,
          changes.subscriptionId
        )
    } : {})
  });

  assert.notEqual(
    result.status,
    "configuration_matches_unverified"
  );
  denied(result);
}

console.log("PASS changed resource identity and table rejected");

for (const candidate of [
  null,
  [],
  {},
  { ...destination, schemaVersion: 2 },
  { ...destination, environment: "production" },
  { ...destination, connectionString: "secret" },
  { ...destination, endpoint: "http://localhost:10002" },
  { ...destination, tableName: "x" },
  { ...destination, accountName: "devstoreaccount1" },
  { ...destination, accountResourceId: "UseDevelopmentStorage=true" },
  new Proxy({ ...destination }, {}),
  Object.create(destination)
]) {
  const value = inspect(candidate);
  assert.equal(value.status, "invalid_input");
  denied(value);
}

console.log("PASS unsafe and extra configuration fields rejected");

let getterCalled = false;
const hostile = Object.defineProperty(
  { ...destination },
  "tableName",
  {
    enumerable: true,
    get() {
      getterCalled = true;
      throw Error("Hostile configuration getter");
    }
  }
);

assert.equal(inspect(hostile).status, "invalid_input");
assert.equal(getterCalled, false);

console.log("PASS hostile getter never executed");

const revoked = Proxy.revocable({ ...destination }, {});
revoked.revoke();

assert.equal(
  inspect(revoked.proxy).status,
  "invalid_input"
);

console.log("PASS revoked proxy rejected");

assert.equal(
  inspect(destination, {
    ...destination,
    tableName: "OtherAuditTable"
  }).status,
  "configuration_mismatch"
);

console.log("PASS separately pinned expectation enforced");
console.log("PASS C6 destination configuration assessment regressions");
