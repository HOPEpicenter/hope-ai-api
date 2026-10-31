import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import {
  createStaffInvitation
} from "../../src/services/staff/createStaffInvitation";

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
  let requestedEmail = "";

  const result = await createStaffInvitation(
    {
      displayName: "  Pastor Invitee  ",
      email: " Invitee@Example.org ",
      roleLabel: "  Care Team  ",
      actorId: "staff-admin-1"
    },
    {
      repository: repository as any,
      sendInvitation: async ({ email }) => {
        requestedEmail = email;

        return {
          entraTenantId: "783EF4B1-7E96-4A71-80DD-06865B015DA9",
          entraObjectId: "C1717A19-C719-4ED2-8B72-E013800095DE"
        };
      },
      now: () => "2026-08-27T12:00:00.000Z",
      newEventId: () => "evt-staff-invited",
      newStaffId: () => "staff-invited-1"
    }
  );

  assert.deepEqual(result, {
    accepted: true,
    eventId: "evt-staff-invited",
    staffId: "staff-invited-1",
    type: "staff.invited"
  });
  assert.equal(requestedEmail, "invitee@example.org");
  assert.equal(repository.events.length, 1);
  assert.deepEqual(repository.events[0], {
    eventId: "evt-staff-invited",
    staffId: "staff-invited-1",
    type: "staff.invited",
    occurredAt: "2026-08-27T12:00:00.000Z",
    actorId: "staff-admin-1",
    data: {
      displayName: "Pastor Invitee",
      roleLabel: "Care Team",
      status: "pending",
      email: "invitee@example.org",
      entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
      entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
    }
  });

  let senderCalled = false;

  const invalidEmail = await createStaffInvitation(
    {
      displayName: "Invalid Email",
      email: "not-an-email",
      actorId: "staff-admin-1"
    },
    {
      repository: repository as any,
      sendInvitation: async () => {
        senderCalled = true;
        throw new Error("The sender must not run.");
      }
    }
  );

  assert.deepEqual(invalidEmail, {
    accepted: false,
    status: 400,
    error: "A valid email is required"
  });
  assert.equal(senderCalled, false);

  // Characterize external success followed by a failed canonical append.
  let syntheticSends = 0;
  let syntheticAppends = 0;

  const failingRepository = {
    async listAll(): Promise<StaffEvent[]> {
      return [];
    },
    async append(_event: StaffEvent): Promise<void> {
      syntheticAppends += 1;
      throw new Error("SYNTHETIC_STAFF_APPEND_FAILURE");
    }
  };

  await assert.rejects(
    createStaffInvitation(
      {
        displayName: "Synthetic Invitee",
        email: "synthetic@example.invalid",
        actorId: "synthetic-admin"
      },
      {
        repository: failingRepository as any,
        sendInvitation: async () => {
          syntheticSends += 1;
          return {
            entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
            entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
          };
        },
        newStaffId: () => "synthetic-staff",
        newEventId: () => "synthetic-event",
        now: () => "2026-10-31T12:00:00.000Z"
      }
    ),
    /SYNTHETIC_STAFF_APPEND_FAILURE/
  );

  assert.equal(syntheticSends, 1);
  assert.equal(syntheticAppends, 1);
  assert.deepEqual(await failingRepository.listAll(), []);

  // Characterize an invalid Entra binding after synthetic external success.
  let invalidBindingSends = 0;
  let invalidBindingAppends = 0;

  const invalidBindingRepository = {
    async listAll(): Promise<StaffEvent[]> {
      return [];
    },
    async append(_event: StaffEvent): Promise<void> {
      invalidBindingAppends += 1;
    }
  };

  const invalidBindingResult = await createStaffInvitation(
    {
      displayName: "Synthetic Invalid Binding",
      email: "invalid-binding@example.invalid",
      actorId: "synthetic-admin"
    },
    {
      repository: invalidBindingRepository as any,
      sendInvitation: async () => {
        invalidBindingSends += 1;
        return {
          entraTenantId: "SYNTHETIC_INVALID_ENTRA_BINDING",
          entraObjectId: "not-a-valid-object-id"
        };
      }
    }
  );

  assert.deepEqual(invalidBindingResult, {
    accepted: false,
    status: 502,
    error: "Microsoft invitation returned an invalid Staff identity"
  });
  assert.equal(invalidBindingSends, 1);
  assert.equal(invalidBindingAppends, 0);
  assert.deepEqual(await invalidBindingRepository.listAll(), []);

  console.log("createStaffInvitation.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
