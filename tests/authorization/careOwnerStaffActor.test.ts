import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  requireCareOwnerActor,
  requireCareOwnerAssignee
} from "../../src/functions/_shared/careOwnerStaffActor";

function staff(
  roleLabel: string | null,
  status: "active" | "inactive" = "active"
): CanonicalStaffIdentity {
  return {
    staffId: "staff-test",
    displayName: "Test Staff",
    roleLabel,
    status,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    lastEventId: "evt-test",
    entraTenantId: null,
    entraObjectId: null,
    email: null,
    phone: null
  };
}

function req(actorId?: string): any {
  return {
    headers: actorId
      ? { "x-hope-staff-actor-id": actorId }
      : {}
  };
}

async function run(): Promise<void> {
  {
    const result = await requireCareOwnerActor(
      req(),
      async () => staff("Pastor")
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  }

  for (const role of ["Pastor", "Ministry Leader"]) {
    const result = await requireCareOwnerActor(
      req("staff-pastoral"),
      async () => staff(role)
    );

    assert.equal(result.ok, true);
  }

  for (const role of [
    "Care Team",
    "Follow-up Team",
    "Youth Leader",
    "Volunteer",
    "Administrator",
    "Staff"
  ]) {
    const result = await requireCareOwnerActor(
      req("staff-denied"),
      async () => staff(role)
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  }

  {
    const result = await requireCareOwnerActor(
      req("staff-inactive"),
      async () => staff("Pastor", "inactive")
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  }

  for (const role of ["Pastor", "Ministry Leader"]) {
    const result = await requireCareOwnerAssignee(
      "staff-assignee",
      async () => staff(role)
    );

    assert.equal(result.ok, true);
  }

  for (const role of [
    "Care Team",
    "Follow-up Team",
    "Youth Leader",
    "Volunteer",
    "Administrator"
  ]) {
    const result = await requireCareOwnerAssignee(
      "staff-assignee",
      async () => staff(role)
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  }

  {
    const result = await requireCareOwnerAssignee(
      "staff-assignee",
      async () => staff("Pastor", "inactive")
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  }

  {
    const result = await requireCareOwnerAssignee(
      "staff-missing",
      async () => null
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  }

  {
    let seenActorId = "";

    const result = await requireCareOwnerActor(
      {
        headers: new Map([
          ["x-hope-staff-actor-id", " staff-pastor "]
        ])
      },
      async staffId => {
        seenActorId = staffId;
        return staff("Pastor");
      }
    );

    assert.equal(result.ok, true);
    assert.equal(seenActorId, "staff-pastor");
  }

  console.log("careOwnerStaffActor.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
