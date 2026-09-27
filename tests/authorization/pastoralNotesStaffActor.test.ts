import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  requirePastoralNotesStaffActor
} from "../../src/functions/_shared/pastoralNotesStaffActor";

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
    const result = await requirePastoralNotesStaffActor(
      req(),
      "view",
      async () => staff("Pastor")
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  }

  for (const capability of ["view", "write"] as const) {
    const pastor = await requirePastoralNotesStaffActor(
      req("staff-pastor"),
      capability,
      async () => staff("Pastor")
    );

    assert.equal(pastor.ok, true);

    const ministryLeader =
      await requirePastoralNotesStaffActor(
        req("staff-leader"),
        capability,
        async () => staff("Ministry Leader")
      );

    assert.equal(ministryLeader.ok, true);
  }

  for (const role of [
    "Care Team",
    "Follow-up Team",
    "Administrator",
    "Youth Leader",
    "Volunteer"
  ]) {
    for (const capability of ["view", "write"] as const) {
      const result = await requirePastoralNotesStaffActor(
        req("staff-denied"),
        capability,
        async () => staff(role)
      );

      assert.equal(result.ok, false);

      if (!result.ok) {
        assert.equal(result.status, 403);
      }
    }
  }

  {
    const result = await requirePastoralNotesStaffActor(
      req("staff-inactive"),
      "view",
      async () => staff("Pastor", "inactive")
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  }

  {
    const result = await requirePastoralNotesStaffActor(
      req("staff-missing"),
      "view",
      async () => null
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  }

  {
    let seenStaffId = "";

    const result = await requirePastoralNotesStaffActor(
      {
        headers: new Map([
          ["x-hope-staff-actor-id", " staff-pastor "]
        ])
      },
      "view",
      async staffId => {
        seenStaffId = staffId;
        return staff("Pastor");
      }
    );

    assert.equal(result.ok, true);
    assert.equal(seenStaffId, "staff-pastor");
  }

  console.log("pastoralNotesStaffActor.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
