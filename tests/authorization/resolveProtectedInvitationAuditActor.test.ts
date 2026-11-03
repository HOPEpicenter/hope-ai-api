import assert from "node:assert/strict";
import { types } from "node:util";

import {
  resolveProtectedInvitationAuditActor
} from "../../src/services/staff/resolveProtectedInvitationAuditActor";

const verificationConfiguration = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  audience: "api://synthetic-backend",
  requiredPermissions: {
    scopes: ["Staff.Access"]
  }
};

const administratorConfiguration = {
  administratorStaffIds: ["staff-synthetic-admin"]
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function main(): Promise<void> {
  let calls = 0;
  let response: unknown = {
    allowed: true,
    authenticatedStaffId: "staff-synthetic-admin",
    action: "system.admin"
  };

  const authorizeAction = (async (
    _token: unknown,
    _configuration: unknown,
    action: unknown
  ) => {
    calls++;
    assert.equal(action, "system.admin");
    return response;
  }) as unknown as
    NonNullable<
      Parameters<typeof resolveProtectedInvitationAuditActor>[3]
    >["authorizeAction"];

  const resolve = (token = "synthetic-token") =>
    resolveProtectedInvitationAuditActor(
      token,
      verificationConfiguration,
      administratorConfiguration,
      { authorizeAction }
    );

  const valid = await resolve();

  assert.equal(valid.status, "authenticated_admin_bound");
  assert.equal(valid.actor?.canonicalStaffId, "staff-synthetic-admin");
  assert.match(valid.actor!.actorCorrelationId, uuidPattern);
  assert.equal(valid.authoritative, false);
  assert.equal(valid.storageAccessPermitted, false);
  assert.equal(valid.invitationExecutionPermitted, false);
  assert.equal(valid.retryPermitted, false);
  assert.equal(valid.productionRolloutPermitted, false);
  assert.ok(Object.isFrozen(valid));
  assert.ok(Object.isFrozen(valid.actor));

  const next = await resolve();
  assert.notEqual(
    valid.actor!.actorCorrelationId,
    next.actor!.actorCorrelationId
  );

  console.log("PASS trusted admin actor and unique correlation binding");

  response = {
    allowed: false,
    reason: "insufficient_authority"
  };

  const denied = await resolve();
  assert.equal(denied.status, "rejected");
  assert.equal(denied.actor, null);

  console.log("PASS unauthorized actor rejected");

  response = {
    allowed: true,
    authenticatedStaffId: "staff-synthetic-admin",
    action: "six_week.view"
  };

  assert.equal((await resolve()).status, "rejected");

  response = {
    allowed: true,
    authenticatedStaffId: " ",
    action: "system.admin"
  };

  assert.equal((await resolve()).status, "rejected");

  console.log("PASS incorrect action and malformed staff ID rejected");

  response = {
    allowed: true,
    authenticatedStaffId: "staff-synthetic-admin",
    action: "system.admin"
  };

  const before = calls;
  assert.equal((await resolve(" ")).status, "rejected");
  assert.equal(calls, before);

  console.log("PASS invalid token input blocks authorization call");

  let getterExecuted = false;

  response = Object.defineProperty(
    {
      allowed: true,
      action: "system.admin"
    },
    "authenticatedStaffId",
    {
      enumerable: true,
      get() {
        getterExecuted = true;
        throw new Error("hostile getter");
      }
    }
  );

  const hostile = await resolve();

  assert.equal(hostile.status, "unavailable");
  assert.equal(hostile.actor, null);
  assert.equal(getterExecuted, false);

  console.log("PASS hostile authorization getter not executed");

  const revoked = Proxy.revocable(
    {
      allowed: true,
      authenticatedStaffId: "staff-synthetic-admin",
      action: "system.admin"
    },
    {}
  );

  revoked.revoke();
  assert.equal(types.isProxy(revoked.proxy), true);

  response = revoked.proxy;

  assert.equal((await resolve()).status, "unavailable");

  console.log("PASS revoked authorization proxy fails closed");

  response = {
    allowed: true,
    authenticatedStaffId: "staff-synthetic-admin",
    action: "system.admin"
  };

  const recovered = await resolve();

  assert.equal(recovered.status, "authenticated_admin_bound");
  assert.equal(recovered.storageAccessPermitted, false);

  console.log("PASS recovery remains non-authorizing");
  console.log("PASS protected invitation audit actor regressions");
}

main().catch(error => {
  console.error("Protected audit actor test failed");
  console.error(
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 1;
});
