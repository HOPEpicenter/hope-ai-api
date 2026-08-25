import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import {
  readStaffIdentityAudit
} from "../../src/services/staff/readStaffIdentityAudit";

class InMemoryStaffRepository {
  constructor(
    private readonly events: StaffEvent[]
  ) {}

  async listAll(): Promise<StaffEvent[]> {
    return [...this.events];
  }
}

async function run(): Promise<void> {
  const repository = new InMemoryStaffRepository([
    {
      eventId: "evt-create",
      staffId: "staff-audit-1",
      type: "staff.created",
      occurredAt: "2026-08-25T12:00:00.000Z",
      actorId: "staff-admin-1",
      data: {
        displayName: "Pastor Audit",
        roleLabel: "Care Pastor",
        status: "active",
        entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
        entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
      }
    },
    {
      eventId: "evt-deactivate",
      staffId: "staff-audit-1",
      type: "staff.deactivated",
      occurredAt: "2026-08-25T12:10:00.000Z",
      actorId: "staff-admin-1",
      data: {
        status: "inactive",
        reason: "Acceptance verification"
      }
    },
    {
      eventId: "evt-other",
      staffId: "staff-audit-2",
      type: "staff.created",
      occurredAt: "2026-08-25T12:15:00.000Z",
      actorId: "staff-admin-1",
      data: {
        displayName: "Other Staff",
        status: "active"
      }
    }
  ]);

  const audit = await readStaffIdentityAudit(
    "staff-audit-1",
    repository as any
  );

  assert.equal(audit.length, 2);
  assert.equal(audit[0]?.eventId, "evt-deactivate");
  assert.equal(audit[0]?.actorId, "staff-admin-1");
  assert.equal(audit[0]?.changes.reason, "Acceptance verification");
  assert.equal(audit[0]?.changes.entraBindingChanged, false);
  assert.equal(audit[1]?.eventId, "evt-create");
  assert.equal(audit[1]?.changes.entraBindingChanged, true);
  assert.equal(
    "entraTenantId" in audit[1]?.changes,
    false,
    "Audit output must not expose Entra identifiers"
  );

  const missing = await readStaffIdentityAudit(
    "staff-missing",
    repository as any
  );

  assert.deepEqual(missing, []);
  console.log("readStaffIdentityAudit.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
