import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  readHighRiskStaffVisibility,
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
    phone: null,
    ministryAreaId: null
  };
}

function req(actorId?: string): any {
  return {
    headers: actorId
      ? {
          "x-hope-staff-actor-id": actorId
        }
      : {}
  };
}

async function run(): Promise<void> {
  {
    const result =
      await readHighRiskStaffVisibility(
        req(),
        async () => staff("Pastor")
      );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  }

  {
    const result =
      await readHighRiskStaffVisibility(
        req("missing"),
        async () => null
      );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  }

  {
    const result =
      await readHighRiskStaffVisibility(
        req("inactive"),
        async () => staff("Pastor", "inactive")
      );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.status, 403);
    }
  }

  for (const role of [
    "Pastor",
    "Ministry Leader"
  ]) {
    const result =
      await readHighRiskStaffVisibility(
        req("pastoral"),
        async () => staff(role)
      );

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(
        result.canViewHighRiskAlerts,
        true
      );
    }
  }

  for (const role of [
    "Care Team",
    "Follow-up Team",
    "Youth Leader",
    "Volunteer",
    "Administrator",
    "Staff"
  ]) {
    const result =
      await readHighRiskStaffVisibility(
        req("non-pastoral"),
        async () => staff(role)
      );

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(
        result.canViewHighRiskAlerts,
        false
      );
    }
  }

  {
    const result =
      await requireHighRiskStaffActor(
        req("care-team"),
        async () => staff("Care Team")
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
    const result =
      await requireHighRiskStaffActor(
        req("pastor"),
        async () => staff("Pastor")
      );

    assert.equal(result.ok, true);
  }

  {
    let seenActorId = "";

    const result =
      await readHighRiskStaffVisibility(
        {
          headers: new Map([
            [
              "x-hope-staff-actor-id",
              " staff-pastor "
            ]
          ])
        },
        async staffId => {
          seenActorId = staffId;
          return staff("Pastor");
        }
      );

    assert.equal(result.ok, true);
    assert.equal(
      seenActorId,
      "staff-pastor"
    );
  }

  console.log(
    "highRiskStaffVisibility.test.ts passed"
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
