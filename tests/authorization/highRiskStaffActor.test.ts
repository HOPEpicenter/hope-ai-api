import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  requireHighRiskStaffActor
} from "../../src/functions/_shared/highRiskStaffActor";

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
    const result = await requireHighRiskStaffActor(
      req(),
      async () => staff("Pastor")
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(
        result.body.error,
        "Missing x-hope-staff-actor-id"
      );
    }
  }

  for (const role of [
    "Pastor",
    "Ministry Leader"
  ]) {
    const result = await requireHighRiskStaffActor(
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
    const result = await requireHighRiskStaffActor(
      req("staff-denied"),
      async () => staff(role)
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(
        result.body.error,
        "Pastoral risk visibility requires pastoral authority"
      );
    }
  }

  {
    const result = await requireHighRiskStaffActor(
      req("staff-inactive"),
      async () => staff("Pastor", "inactive")
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  }

  {
    const result = await requireHighRiskStaffActor(
      req("staff-missing"),
      async () => null
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  }

  {
    let seenStaffId = "";

    const result = await requireHighRiskStaffActor(
      {
        headers: new Map([
          ["x-hope-staff-actor-id", " staff-pastor "]
        ])
      },
      async staffId => {
        seenStaffId = staffId;
        return staff("Pastor");
      }
    );

    assert.equal(result.ok, true);
    assert.equal(seenStaffId, "staff-pastor");
  }

  {
    const result = await requireHighRiskStaffActor(
      req("staff-normalized"),
      async () => staff(" pastor ")
    );

    assert.equal(result.ok, true);
  }

  {
    const result = await requireHighRiskStaffActor(
      req("staff-normalized"),
      async () => staff("MINISTRY LEADER")
    );

    assert.equal(result.ok, true);
  }

  console.log("highRiskStaffActor.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
