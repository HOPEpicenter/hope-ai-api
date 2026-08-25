import assert from "node:assert/strict";
import {
  requireAdminStaffActorForFunction
} from "../../src/functions/_shared/adminStaffActor";

function request(headers: Record<string, string>): any {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null
    }
  };
}

async function run(): Promise<void> {
  const priorAdminApiKey = process.env.HOPE_ADMIN_API_KEY;
  const priorAdminStaffIds = process.env.HOPE_ADMIN_STAFF_IDS;

  try {
    process.env.HOPE_ADMIN_API_KEY = "test-admin-key";
    process.env.HOPE_ADMIN_STAFF_IDS = "staff-admin-1";

    const accepted = await requireAdminStaffActorForFunction(
      request({
        "x-admin-api-key": "test-admin-key",
        "x-hope-admin-actor-id": "staff-admin-1"
      }),
      async staffId => ({
        staffId,
        displayName: "Pastor Administrator",
        roleLabel: "Administrator",
        status: "active",
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
        lastEventId: "evt-admin",
        entraTenantId: null,
        entraObjectId: null
      })
    );

    assert.deepEqual(accepted, { ok: true, actorId: "staff-admin-1" });

    const missingActor = await requireAdminStaffActorForFunction(
      request({ "x-admin-api-key": "test-admin-key" }),
      async () => null
    );

    assert.equal(missingActor.ok, false);
    if (!missingActor.ok) {
      assert.equal(missingActor.status, 401);
      assert.equal(missingActor.body.error, "Missing x-hope-admin-actor-id");
    }

    const ordinaryStaff = await requireAdminStaffActorForFunction(
      request({
        "x-admin-api-key": "test-admin-key",
        "x-hope-admin-actor-id": "staff-ordinary-1"
      }),
      async () => null
    );

    assert.equal(ordinaryStaff.ok, false);
    if (!ordinaryStaff.ok) {
      assert.equal(ordinaryStaff.status, 403);
      assert.equal(
        ordinaryStaff.body.error,
        "Only configured ministry administrators can manage Staff identities"
      );
    }

    const inactiveAdministrator = await requireAdminStaffActorForFunction(
      request({
        "x-admin-api-key": "test-admin-key",
        "x-hope-admin-actor-id": "staff-admin-1"
      }),
      async staffId => ({
        staffId,
        displayName: "Former Administrator",
        roleLabel: "Administrator",
        status: "inactive",
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
        lastEventId: "evt-admin-inactive",
        entraTenantId: null,
        entraObjectId: null
      })
    );

    assert.equal(inactiveAdministrator.ok, false);
    if (!inactiveAdministrator.ok) {
      assert.equal(inactiveAdministrator.status, 403);
      assert.equal(
        inactiveAdministrator.body.error,
        "Administrative Staff identity must be active"
      );
    }
  } finally {
    if (priorAdminApiKey === undefined) {
      delete process.env.HOPE_ADMIN_API_KEY;
    } else {
      process.env.HOPE_ADMIN_API_KEY = priorAdminApiKey;
    }

    if (priorAdminStaffIds === undefined) {
      delete process.env.HOPE_ADMIN_STAFF_IDS;
    } else {
      process.env.HOPE_ADMIN_STAFF_IDS = priorAdminStaffIds;
    }
  }

  console.log("adminStaffActor.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
