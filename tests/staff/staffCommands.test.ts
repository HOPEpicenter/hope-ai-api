import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import {
  createStaffIdentity,
  updateStaffIdentity
} from "../../src/services/staff/staffCommands";

class InMemoryStaffRepository {
  readonly events: StaffEvent[] = [];

  async append(event: StaffEvent): Promise<void> {
    this.events.push(event);
  }

  async listAll(): Promise<StaffEvent[]> {
    return [...this.events];
  }
}

async function run(): Promise<void> {
  const repository = new InMemoryStaffRepository();

  const createResult = await createStaffIdentity(
    {
      displayName: "  Pastor Dynamic  ",
      roleLabel: "  Care Pastor  ",
      actorId: "  admin-user-1  "
    },
    {
      repository: repository as any,
      now: () => "2026-07-13T14:00:00.000Z",
      newEventId: () => "evt-create-staff",
      newStaffId: () => "staff-dynamic-1"
    }
  );

  assert.equal(createResult.accepted, true);

  if (!createResult.accepted) {
    throw new Error("Expected create command to be accepted.");
  }

  assert.equal(createResult.eventId, "evt-create-staff");
  assert.equal(createResult.staffId, "staff-dynamic-1");
  assert.equal(createResult.type, "staff.created");
  assert.equal(repository.events.length, 1);

  assert.deepEqual(repository.events[0], {
    eventId: "evt-create-staff",
    staffId: "staff-dynamic-1",
    type: "staff.created",
    occurredAt: "2026-07-13T14:00:00.000Z",
    actorId: "admin-user-1",
    data: {
      displayName: "Pastor Dynamic",
      roleLabel: "Care Pastor",
      status: "active"
    }
  });

  const updateResult = await updateStaffIdentity(
    {
      staffId: "staff-dynamic-1",
      displayName: "Pastor Updated",
      roleLabel: "Lead Care Pastor",
      actorId: "admin-user-2"
    },
    {
      repository: repository as any,
      now: () => "2026-07-13T14:05:00.000Z",
      newEventId: () => "evt-update-staff"
    }
  );

  assert.equal(updateResult.accepted, true);

  if (!updateResult.accepted) {
    throw new Error("Expected update command to be accepted.");
  }

  assert.equal(updateResult.type, "staff.updated");
  assert.equal(repository.events.length, 2);

  assert.deepEqual(repository.events[1], {
    eventId: "evt-update-staff",
    staffId: "staff-dynamic-1",
    type: "staff.updated",
    occurredAt: "2026-07-13T14:05:00.000Z",
    actorId: "admin-user-2",
    data: {
      displayName: "Pastor Updated",
      roleLabel: "Lead Care Pastor"
    }
  });

  const deactivateResult = await updateStaffIdentity(
    {
      staffId: "staff-dynamic-1",
      status: "inactive",
      reason: "Role concluded",
      actorId: "admin-user-3"
    },
    {
      repository: repository as any,
      now: () => "2026-07-13T14:10:00.000Z",
      newEventId: () => "evt-deactivate-staff"
    }
  );

  assert.equal(deactivateResult.accepted, true);

  if (!deactivateResult.accepted) {
    throw new Error("Expected deactivate command to be accepted.");
  }

  assert.equal(deactivateResult.type, "staff.deactivated");
  assert.equal(repository.events.length, 3);

  assert.deepEqual(repository.events[2], {
    eventId: "evt-deactivate-staff",
    staffId: "staff-dynamic-1",
    type: "staff.deactivated",
    occurredAt: "2026-07-13T14:10:00.000Z",
    actorId: "admin-user-3",
    data: {
      status: "inactive",
      reason: "Role concluded"
    }
  });

  const missingResult = await updateStaffIdentity(
    {
      staffId: "staff-missing",
      displayName: "Missing",
      actorId: "admin-user-4"
    },
    {
      repository: repository as any
    }
  );

  assert.deepEqual(missingResult, {
    accepted: false,
    status: 404,
    error: "Staff identity not found"
  });

  const emptyUpdateResult = await updateStaffIdentity(
    {
      staffId: "staff-dynamic-1",
      actorId: "admin-user-5"
    },
    {
      repository: repository as any
    }
  );

  assert.deepEqual(emptyUpdateResult, {
    accepted: false,
    status: 400,
    error: "At least one mutable staff field is required"
  });

  const invalidCreateResult = await createStaffIdentity(
    {
      displayName: " ",
      actorId: "admin-user-6"
    },
    {
      repository: repository as any
    }
  );

  assert.deepEqual(invalidCreateResult, {
    accepted: false,
    status: 400,
    error: "displayName is required"
  });

  console.log("staffCommands.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
