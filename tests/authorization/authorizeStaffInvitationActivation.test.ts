import assert from "node:assert/strict";
import {
  authorizeStaffInvitationActivation,
  type VerifyStaffInvitationActivationToken
} from "../../src/services/authorization/authorizeStaffInvitationActivation";
import type {
  EntraStaffTokenVerificationConfiguration
} from "../../src/services/authorization/verifyEntraStaffAccessToken";

const tenantId = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const objectId = "c1717a19-c719-4ed2-8b72-e013800095de";
const otherObjectId = "33a40230-0bea-4cf9-a7e0-d33d95d38c99";
const otherTenantId = "574cf044-c651-4fd9-a57c-cd6f881a985e";

const configuration: EntraStaffTokenVerificationConfiguration = {
  tenantId,
  audience: "api://synthetic-hope-backend",
  requiredPermissions: {
    scopes: ["HOPE.Staff.Activate"]
  }
};

function verifiedIdentity(
  resolvedTenantId = tenantId,
  resolvedObjectId = objectId
): VerifyStaffInvitationActivationToken {
  return async () => ({
    tenantId: resolvedTenantId,
    objectId: resolvedObjectId,
    scopes: ["HOPE.Staff.Activate"],
    roles: []
  });
}

async function run(): Promise<void> {
  // Matching verified identity is authorized.
  {
    const result = await authorizeStaffInvitationActivation(
      "synthetic-token",
      tenantId,
      objectId,
      configuration,
      verifiedIdentity()
    );

    assert.deepEqual(result, {
      allowed: true,
      tenantId,
      objectId
    });
  }

  // GUID comparisons are case insensitive.
  {
    const result = await authorizeStaffInvitationActivation(
      "synthetic-token",
      tenantId.toUpperCase(),
      objectId.toUpperCase(),
      configuration,
      verifiedIdentity()
    );

    assert.equal(result.allowed, true);
  }

  // A different verified object cannot activate the target.
  {
    const result = await authorizeStaffInvitationActivation(
      "synthetic-token",
      tenantId,
      objectId,
      configuration,
      verifiedIdentity(tenantId, otherObjectId)
    );

    assert.deepEqual(result, {
      allowed: false,
      reason: "identity_mismatch"
    });
  }

  // A different verified tenant is also rejected.
  {
    const result = await authorizeStaffInvitationActivation(
      "synthetic-token",
      tenantId,
      objectId,
      configuration,
      verifiedIdentity(otherTenantId, objectId)
    );

    assert.deepEqual(result, {
      allowed: false,
      reason: "identity_mismatch"
    });
  }

  // Invalid target IDs must be rejected before token verification.
  {
    let verifierCalled = false;

    const result = await authorizeStaffInvitationActivation(
      "synthetic-token",
      "not-a-guid",
      objectId,
      configuration,
      async () => {
        verifierCalled = true;
        return {
          tenantId,
          objectId,
          scopes: [],
          roles: []
        };
      }
    );

    assert.deepEqual(result, {
      allowed: false,
      reason: "invalid_target"
    });
    assert.equal(verifierCalled, false);
  }

  // Missing tokens are rejected before verification.
  {
    let verifierCalled = false;

    const result = await authorizeStaffInvitationActivation(
      "",
      tenantId,
      objectId,
      configuration,
      async () => {
        verifierCalled = true;
        return {
          tenantId,
          objectId,
          scopes: [],
          roles: []
        };
      }
    );

    assert.deepEqual(result, {
      allowed: false,
      reason: "authentication_failed"
    });
    assert.equal(verifierCalled, false);
  }

  // Missing configuration fails closed.
  {
    const result = await authorizeStaffInvitationActivation(
      "synthetic-token",
      tenantId,
      objectId,
      undefined as unknown as EntraStaffTokenVerificationConfiguration,
      verifiedIdentity()
    );

    assert.deepEqual(result, {
      allowed: false,
      reason: "authentication_failed"
    });
  }

  // Token-verification failures are never authorization successes.
  {
    const result = await authorizeStaffInvitationActivation(
      "synthetic-token",
      tenantId,
      objectId,
      configuration,
      async () => {
        throw new Error("Synthetic signature verification failure");
      }
    );

    assert.deepEqual(result, {
      allowed: false,
      reason: "authentication_failed"
    });
  }

  // Malformed verified identity evidence fails closed.
  {
    const result = await authorizeStaffInvitationActivation(
      "synthetic-token",
      tenantId,
      objectId,
      configuration,
      verifiedIdentity(tenantId, "invalid-object")
    );

    assert.deepEqual(result, {
      allowed: false,
      reason: "authentication_failed"
    });
  }

  // Invalid configuration cannot reach the token verifier.
  {
    const invalidConfigurations: Array<{
      name: string;
      value: EntraStaffTokenVerificationConfiguration;
    }> = [
      {
        name: "invalid tenant",
        value: { ...configuration, tenantId: "invalid" }
      },
      {
        name: "mismatched tenant",
        value: { ...configuration, tenantId: otherTenantId }
      },
      {
        name: "missing audience",
        value: { ...configuration, audience: "" }
      },
      {
        name: "whitespace audience",
        value: { ...configuration, audience: " api://synthetic " }
      },
      {
        name: "missing permissions",
        value: {
          ...configuration,
          requiredPermissions: {}
        }
      },
      {
        name: "empty permissions",
        value: {
          ...configuration,
          requiredPermissions: { scopes: [], roles: [] }
        }
      }
    ];

    for (const scenario of invalidConfigurations) {
      let verifierCalled = false;

      const result = await authorizeStaffInvitationActivation(
        "synthetic-token",
        tenantId,
        objectId,
        scenario.value,
        async () => {
          verifierCalled = true;
          return {
            tenantId,
            objectId,
            scopes: ["HOPE.Staff.Activate"],
            roles: []
          };
        }
      );

      assert.deepEqual(
        result,
        {
          allowed: false,
          reason: "authentication_failed"
        },
        scenario.name
      );

      assert.equal(
        verifierCalled,
        false,
        `${scenario.name}: verifier must not be invoked`
      );
    }
  }
  console.log(
    "Staff invitation activation authorization regression tests passed"
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
