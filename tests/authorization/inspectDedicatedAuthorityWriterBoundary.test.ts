import assert from "node:assert/strict";
import {
  inspectDedicatedAuthorityWriterBoundary,
  type DedicatedAuthorityWriterBoundary
} from "../../src/domain/staff/inspectDedicatedAuthorityWriterBoundary";

const identityA = "11111111-1111-4111-8111-111111111111";
const identityB = "22222222-2222-4222-8222-222222222222";
const separated = {
  authenticationMode: "managed-identity",
  canonicalTableEndpoint: "https://syntheticcanonical.table.core.windows.net",
  authorityTableEndpoint: "https://syntheticauthority.table.core.windows.net",
  canonicalWriterClientId: identityA,
  authorityWriterClientId: identityB
} as const;

function inspect(value: unknown, classification: DedicatedAuthorityWriterBoundary["classification"], reason: DedicatedAuthorityWriterBoundary["reason"]) {
  const outcome = inspectDedicatedAuthorityWriterBoundary(value);
  assert.equal(outcome.classification, classification);
  assert.equal(outcome.reason, reason);
  assert.equal(outcome.storageConnectionPermitted, false);
  assert.equal(outcome.authorityWritePermitted, false);
  assert.equal(outcome.executionPermitted, false);
  assert.equal(outcome.migrationPermitted, false);
  assert.equal(outcome.retryPermitted, false);
  assert.equal(outcome.productionRolloutPermitted, false);
  assert.equal(outcome.effectivePermissionIsolationVerified, false);
}
inspect(separated, "candidate_isolated", "synthetic_metadata_separated_non_authorizing");
inspect({ ...separated, authorityTableEndpoint: separated.canonicalTableEndpoint }, "blocked", "shared_application_storage_endpoint");
inspect({ ...separated, authorityTableEndpoint: "https://SYNTHETICCANONICAL.table.core.windows.net/" }, "blocked", "shared_application_storage_endpoint");
inspect({ ...separated, authorityWriterClientId: identityA }, "blocked", "shared_application_identity");
inspect({ ...separated, authenticationMode: "connection-string" }, "blocked", "unsupported_authentication_mode");
inspect({ ...separated, authenticationMode: undefined }, "blocked", "unsupported_authentication_mode");
inspect({ ...separated, authorityTableEndpoint: "https://syntheticauthority.table.core.windows.net.evil.test" }, "blocked", "missing_or_invalid_metadata");
inspect({ ...separated, authorityTableEndpoint: "http://syntheticauthority.table.core.windows.net" }, "blocked", "missing_or_invalid_metadata");
inspect({ ...separated, authorityWriterClientId: "not-a-guid" }, "blocked", "missing_or_invalid_metadata");
inspect({}, "blocked", "unsupported_authentication_mode");
inspect(null, "blocked", "missing_or_invalid_metadata");

let getterCalled = false;
const malicious = Object.defineProperty({}, "authenticationMode", {
  get() {
    getterCalled = true;
    throw new Error("must not execute getter");
  }
});
inspect(malicious, "blocked", "unsupported_authentication_mode");
assert.equal(getterCalled, false);
const revoked = Proxy.revocable({}, {});
revoked.revoke();
inspect(revoked.proxy, "blocked", "missing_or_invalid_metadata");

console.log("E151 disabled authority writer boundary regressions passed");
