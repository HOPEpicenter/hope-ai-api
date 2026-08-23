import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import {
  readCanonicalStaffIdentityByEntraBinding
} from "../../src/services/staff/readCanonicalStaffDirectory";

class InMemoryStaffRepository {
  constructor(private readonly events: StaffEvent[]) {}

  async listAll(): Promise<StaffEvent[]> {
    return [...this.events];
  }
}

async function run(): Promise<void> {
  const repository = new InMemoryStaffRepository([
    {
      eventId: "evt-staff-created",
      staffId: "staff-0fee84010a1c40529952c41ef256cacf",
      type: "staff.created",
      occurredAt: "2026-08-22T00:00:00.000Z",
      actorId: "admin-bootstrap",
      data: {
        displayName: "Douglas Myrie",
        status: "active",
        entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
        entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
      }
    }
  ]);

  const identity = await readCanonicalStaffIdentityByEntraBinding(
    "783EF4B1-7E96-4A71-80DD-06865B015DA9",
    "C1717A19-C719-4ED2-8B72-E013800095DE",
    repository as any
  );

  assert.equal(identity?.staffId, "staff-0fee84010a1c40529952c41ef256cacf");
  console.log("readCanonicalStaffIdentityByEntraBinding.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
