import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  StaffScopedAtomicResult
} from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  activateStaffInvitation
} from "../../src/services/staff/activateStaffInvitation";

const tenantId = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const objectId = "c1717a19-c719-4ed2-8b72-e013800095de";

const input = {
  entraTenantId: tenantId,
  entraObjectId: objectId
};

const fixed = {
  now: () => "2026-11-09T11:00:00.000Z",
  newEventId: () => "evt-synthetic-activation"
};

class SyntheticRepository {
  readonly events: StaffEvent[];

  constructor(status: "pending" | "active" | "inactive" = "pending") {
    this.events = [{
      eventId: "evt-synthetic-invitation",
      staffId: "synthetic-staff",
      type: "staff.invited",
      occurredAt: "2026-11-09T10:00:00.000Z",
      actorId: "synthetic-admin",
      data: {
        displayName: "Synthetic Staff",
        status,
        entraTenantId: tenantId,
        entraObjectId: objectId
      }
    }];
  }

  async append(event: StaffEvent): Promise<void> {
    this.events.push(event);
  }

  async listAll(): Promise<StaffEvent[]> {
    return [...this.events];
  }
}

function decision(
  status: StaffScopedAtomicResult["status"]
): StaffScopedAtomicResult {
  return {
    status,
    executionPermitted: false,
    retryPermitted: false,
    productionWriterFenced: false
  };
}

async function run(): Promise<void> {
  {
    const repository = new SyntheticRepository();
    let calls = 0;

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutation: async () => {
        calls++;
        return decision("committed");
      }
    });

    assert.equal(result.accepted, true);
    assert.equal(calls, 0);
    assert.equal(repository.events.length, 2);
    assert.equal(repository.events[1].type, "staff.activated");
    console.log("[PASS] Default-off activation append preserved");
  }

  {
    const repository = new SyntheticRepository();

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 503,
      error: "Atomic Staff activation writer unavailable"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Missing activation writer fails closed");
  }

  {
    const repository = new SyntheticRepository();
    let calls = 0;
    let observed: StaffEvent | undefined;

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async event => {
        calls++;
        observed = event;
        return decision("committed");
      }
    });

    assert.deepEqual(result, {
      accepted: true,
      staffId: "synthetic-staff",
      eventId: "evt-synthetic-activation",
      activated: true
    });
    assert.equal(calls, 1);
    assert.equal(repository.events.length, 1);
    assert.equal(observed?.type, "staff.activated");
    assert.deepEqual(observed?.data, { status: "active" });
    console.log("[PASS] Atomic activation acknowledged once");
  }

  {
    const repository = new SyntheticRepository();

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => decision("denied")
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 409,
      error: "Atomic Staff activation denied"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Denied activation has no fallback");
  }

  {
    const repository = new SyntheticRepository();
    let calls = 0;

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => {
        calls++;
        return decision("uncertain");
      }
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 503,
      error: "Atomic Staff activation outcome uncertain"
    });
    assert.equal(calls, 1);
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Uncertain activation has no fallback");
  }

  {
    const repository = new SyntheticRepository();

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => {
        throw new Error("synthetic transaction failure");
      }
    });

    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 503);
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Activation writer exception fails closed");
  }

  {
    const repository = new SyntheticRepository();

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => ({
        ...decision("committed"),
        productionWriterFenced: true
      } as unknown as StaffScopedAtomicResult)
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 503,
      error: "Atomic Staff activation result invalid"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Invalid fencing claim rejected");
  }

  {
    const repository = new SyntheticRepository("active");
    let calls = 0;

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => {
        calls++;
        return decision("committed");
      }
    });

    assert.deepEqual(result, {
      accepted: true,
      staffId: "synthetic-staff",
      eventId: null,
      activated: false
    });
    assert.equal(calls, 0);
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Existing active identity unchanged");
  }

  {
    const repository = new SyntheticRepository("inactive");
    let calls = 0;

    const result = await activateStaffInvitation(input, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => {
        calls++;
        return decision("committed");
      }
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 403,
      error: "Only pending Staff invitations can be activated"
    });
    assert.equal(calls, 0);
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Inactive identity cannot reactivate");
  }

  {
    const repository = new SyntheticRepository();
    let calls = 0;

    const result = await activateStaffInvitation({
      entraTenantId: "invalid-guid",
      entraObjectId: objectId
    }, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => {
        calls++;
        return decision("committed");
      }
    });

    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 400);
    assert.equal(calls, 0);
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Invalid binding rejected before writer");
  }

  console.log("[PASS] Staff activation atomic participation regressions");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});