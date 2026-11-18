import assert from "node:assert/strict";
import {
  verifyKioskBootstrapOwner
} from "../../src/services/staff/verifyKioskBootstrapOwner";

const tenant = "11111111-1111-4111-8111-111111111111";
const object = "22222222-2222-4222-8222-222222222222";
const token = `${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`;

const config = {
  tenantId: tenant,
  expectedOwnerObjectId: object,
  audience: "api://isolated-test-api",
  requiredPermissions: { scopes: ["Owner.Verify"] },
  allowedClientApplicationIds: [
    "33333333-3333-4333-8333-333333333333"
  ]
};

async function main(): Promise<void> {
  let calls = 0;

  const verifier = async () => {
    calls++;
    return {
      tenantId: tenant,
      objectId: object,
      scopes: ["Owner.Verify"],
      roles: []
    };
  };

  const disabled = await verifyKioskBootstrapOwner(
    token, config, false, verifier
  );
  assert.equal(disabled.verified, false);
  assert.equal(calls, 0);

  const invalid = await verifyKioskBootstrapOwner(
    "invalid", config, true, verifier
  );
  assert.equal(invalid.verified, false);
  assert.equal(calls, 0);

  const verified = await verifyKioskBootstrapOwner(
    token, config, true, verifier
  );
  assert.equal(verified.verified, true);
  assert.equal(calls, 1);
  assert.equal(
    verified.status,
    "OWNER_TOKEN_VERIFIED_EXECUTION_DISABLED"
  );

  const wrongTenant = await verifyKioskBootstrapOwner(
    token, config, true,
    async () => ({
      tenantId: "44444444-4444-4444-8444-444444444444",
      objectId: object,
      scopes: ["Owner.Verify"],
      roles: []
    })
  );
  assert.equal(wrongTenant.verified, false);

  const wrongOwner = await verifyKioskBootstrapOwner(
    token,
    {
      ...config,
      expectedOwnerObjectId:
        "44444444-4444-4444-8444-444444444444"
    },
    true,
    verifier
  );
  assert.equal(wrongOwner.verified, false);

  const missingOwner = await verifyKioskBootstrapOwner(
    token,
    { ...config, expectedOwnerObjectId: "" },
    true,
    verifier
  );
  assert.equal(missingOwner.verified, false);
  const rejected = await verifyKioskBootstrapOwner(
    token, config, true,
    async () => {
      throw new Error("invalid token");
    }
  );
  assert.equal(rejected.verified, false);

  const missingClientFence = await verifyKioskBootstrapOwner(
    token,
    { ...config, allowedClientApplicationIds: undefined },
    true,
    verifier
  );
  assert.equal(missingClientFence.verified, false);

  for (const outcome of [
    disabled, invalid, verified, wrongTenant,
    rejected, missingClientFence, wrongOwner, missingOwner
  ]) {
    assert.equal(outcome.executionPermitted, false);
    assert.equal(outcome.staffCreationPermitted, false);
    assert.equal(outcome.authorizationGranted, false);
    assert.equal(outcome.approvalConsumptionPermitted, false);
    assert.equal("objectId" in outcome, false);
    assert.equal("token" in outcome, false);
  }

  console.log("DEFAULT_DISABLED_PASSED=True");
  console.log("INVALID_TOKEN_SHAPE_DENIED=True");
  console.log("TRUSTED_VERIFIER_INJECTION_PASSED=True");
  console.log("TENANT_MISMATCH_DENIED=True");
  console.log("WRONG_OWNER_OBJECT_ID_DENIED=True");
  console.log("MISSING_OWNER_OBJECT_ID_DENIED=True");
  console.log("VERIFIER_FAILURE_DENIED=True");
  console.log("CLIENT_FENCE_REQUIRED=True");
  console.log("NO_IDENTITY_INFORMATION_RETURNED=True");
  console.log("STAFF_CREATION_ALWAYS_DISABLED=True");
  console.log("K319_OFFLINE_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
