import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import {
  activateStaffInvitation
} from "../../src/services/staff/activateStaffInvitation";

class InMemoryStaffRepository {
  readonly events: StaffEvent[];

  constructor(events: StaffEvent[]) {
    this.events = [...events];
  }

  async append(event: StaffEvent): Promise<void> {
    this.events.push(event);
  }

  async listAll(): Promise<StaffEvent[]> {
    return [...this.events];
  }
}

const invitation: StaffEvent = {
  eventId: "evt-invited",
  staffId: "staff-invited-1",
  type: "staff.invited",
  occurredAt: "2026-08-27T12:00:00.000Z",
  actorId: "staff-admin-1",
  data: {
    displayName: "Invited Ministry Staff",
    roleLabel: "Care Team",
    status: "pending",
    entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
    entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
  }
};

async function run(): Promise<void> {
  const repository = new InMemoryStaffRepository([invitation]);

  const activated = await activateStaffInvitation(
    {
      entraTenantId: "783EF4B1-7E96-4A71-80DD-06865B015DA9",
      entraObjectId: "C1717A19-C719-4ED2-8B72-E013800095DE"
    },
    {
      repository: repository as any,
      now: () => "2026-08-27T12:05:00.000Z",
      newEventId: () => "evt-activated"
    }
  );

  assert.deepEqual(activated, {
    accepted: true,
    staffId: "staff-invited-1",
    eventId: "evt-activated",
    activated: true
  });
  assert.deepEqual(repository.events[1], {
    eventId: "evt-activated",
    staffId: "staff-invited-1",
    type: "staff.activated",
    occurredAt: "2026-08-27T12:05:00.000Z",
    actorId: "staff-invited-1",
    data: {
      status: "active"
    }
  });

  const repeated = await activateStaffInvitation(
    {
      entraTenantId: invitation.data.entraTenantId ?? "",
      entraObjectId: invitation.data.entraObjectId ?? ""
    },
    {
      repository: repository as any
    }
  );

  assert.deepEqual(repeated, {
    accepted: true,
    staffId: "staff-invited-1",
    eventId: null,
    activated: false
  });
  assert.equal(repository.events.length, 2);

  const missing = await activateStaffInvitation(
    {
      entraTenantId: invitation.data.entraTenantId ?? "",
      entraObjectId: "58f1f21f-2fcb-43ab-85c4-741d8cc59a7f"
    },
    {
      repository: repository as any
    }
  );

  assert.deepEqual(missing, {
    accepted: false,
    status: 404,
    error: "Canonical Staff Identity not found"
  });

  console.log("activateStaffInvitation.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
