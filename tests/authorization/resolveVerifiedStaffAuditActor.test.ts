import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  EntraStaffTokenVerificationConfiguration,
  VerifiedEntraStaffAccessToken
} from "../../src/services/authorization/verifyEntraStaffAccessToken";
import {
  resolveVerifiedStaffAuditActor
} from "../../src/services/staff/resolveVerifiedStaffAuditActor";

const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";

const configuration: EntraStaffTokenVerificationConfiguration = {
  tenantId,
  audience: "api://synthetic-hope-backend",
  requiredPermissions: {
    scopes: ["Staff.Access"]
  }
};

const verified: VerifiedEntraStaffAccessToken = {
  tenantId,
  objectId,
  scopes: ["Staff.Access"],
  roles: []
};

const active: CanonicalStaffIdentity = {
  staffId: "staff-synthetic-1",
  displayName: "Synthetic Staff",
  roleLabel: "Staff",
  status: "active",
  createdAt: null,
  updatedAt: null,
  lastEventId: null,
  entraTenantId: tenantId,
  entraObjectId: objectId,
  email: null,
  phone: null,
  ministryAreaId: null
};

async function main(): Promise<void> {
  let verificationCalls = 0;
  let directoryCalls = 0;
  let directory: CanonicalStaffIdentity[] = [active];
  let verifiedResponse: VerifiedEntraStaffAccessToken = verified;
  let tokenFails = false;
  let directoryFails = false;

  const dependencies = {
    async verifyToken(): Promise<VerifiedEntraStaffAccessToken> {
      verificationCalls++;
      if (tokenFails) throw new Error("invalid synthetic token");
      return verifiedResponse;
    },
    async readDirectory(): Promise<CanonicalStaffIdentity[]> {
      directoryCalls++;
      if (directoryFails) throw new Error("storage unavailable");
      return directory;
    }
  };

  const resolve = (token = "synthetic-token") =>
    resolveVerifiedStaffAuditActor(
      token,
      configuration,
      dependencies
    );

  const allowed = await resolve();

  assert.equal(allowed.status, "verified_active_staff");
  assert.deepEqual(allowed.actor, {
    staffId: active.staffId,
    entraTenantId: tenantId,
    entraObjectId: objectId
  });
  assert.equal(allowed.authoritative, false);
  assert.equal(allowed.executionPermitted, false);
  assert.equal(allowed.retryPermitted, false);
  assert.equal(allowed.productionRolloutPermitted, false);
  assert.ok(Object.isFrozen(allowed));
  assert.ok(Object.isFrozen(allowed.actor));

  console.log("PASS verified token and unique active canonical staff");

  for (const status of ["pending", "inactive"] as const) {
    directory = [{ ...active, status }];
    const result = await resolve();
    assert.equal(result.status, "rejected");
    assert.equal(result.actor, null);
  }

  console.log("PASS pending and inactive staff rejected");

  directory = [];
  assert.equal((await resolve()).status, "rejected");

  directory = [active, { ...active }];
  assert.equal((await resolve()).status, "rejected");

  directory = [
    active,
    { ...active, staffId: "staff-synthetic-2" }
  ];
  assert.equal((await resolve()).status, "rejected");

  console.log("PASS missing and duplicate bindings rejected");

  directory = [{ ...active, entraObjectId:
    "33333333-3333-4333-8333-333333333333" }];
  assert.equal((await resolve()).status, "rejected");

  directory = [{ ...active, staffId: " " }];
  assert.equal((await resolve()).status, "unavailable");

  directory = [active];
  console.log("PASS mismatched bindings and malformed IDs rejected");

  const before = directoryCalls;
  tokenFails = true;

  const invalid = await resolve();
  assert.equal(invalid.status, "rejected");
  assert.equal(invalid.actor, null);
  assert.equal(directoryCalls, before);

  tokenFails = false;
  console.log("PASS failed token verification blocks directory access");

  const verifyBefore = verificationCalls;
  const blank = await resolve(" ");
  assert.equal(blank.status, "rejected");
  assert.equal(verificationCalls, verifyBefore);

  console.log("PASS invalid token input rejected before verification");

  directoryFails = true;

  const unavailable = await resolve();
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.actor, null);
  assert.equal(unavailable.executionPermitted, false);

  directoryFails = false;
  console.log("PASS directory failures fail closed");

  let getterCalled = false;

  const hostileIdentity = Object.defineProperty(
    { ...active },
    "status",
    {
      enumerable: true,
      get() {
        getterCalled = true;
        throw new Error("hostile status accessor");
      }
    }
  );

  directory = [hostileIdentity];

  const hostileResult = await resolve();
  assert.equal(hostileResult.status, "unavailable");
  assert.equal(hostileResult.actor, null);
  assert.equal(getterCalled, false);

  console.log("PASS hostile directory getter not executed");

  const revoked = Proxy.revocable({ ...active }, {});
  revoked.revoke();

  directory = [revoked.proxy];

  const revokedResult = await resolve();
  assert.equal(revokedResult.status, "unavailable");
  assert.equal(revokedResult.actor, null);

  console.log("PASS revoked directory proxy fails closed");

  directory = [
    active,
    { ...active, entraTenantId: null, entraObjectId: null,
      status: "active", staffId: "staff-other" }
  ];

  assert.equal(
    (await resolve()).status,
    "verified_active_staff"
  );

  console.log("PASS legitimate unbound staff does not block match");

  directory = [
    active,
    { ...active, staffId: "staff-malformed",
      entraTenantId: "malformed", entraObjectId: objectId }
  ];

  assert.equal((await resolve()).status, "unavailable");

  console.log("PASS malformed directory evidence fails closed");

  directory = [active];

  verifiedResponse = Object.defineProperty(
    { ...verified },
    "objectId",
    {
      enumerable: true,
      get() {
        getterCalled = true;
        throw new Error("hostile token accessor");
      }
    }
  );

  getterCalled = false;

  const hostileToken = await resolve();
  assert.equal(hostileToken.status, "rejected");
  assert.equal(hostileToken.actor, null);
  assert.equal(getterCalled, false);

  console.log("PASS hostile verification result rejected");

  const revokedToken = Proxy.revocable({ ...verified }, {});
  revokedToken.revoke();
  verifiedResponse = revokedToken.proxy;

  assert.equal((await resolve()).status, "rejected");

  console.log("PASS revoked verification result rejected");

  verifiedResponse = verified;
  directory = [active];

  const recovered = await resolve();
  assert.equal(recovered.status, "verified_active_staff");

  assert.ok(verificationCalls > 0);
  assert.ok(directoryCalls > 0);

  console.log("PASS identity recovery is non-authorizing");
  console.log("PASS C6 verified staff audit actor regressions");
}

main().catch(error => {
  console.error("C6 staff audit actor regression failed");
  console.error(
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 1;
});
