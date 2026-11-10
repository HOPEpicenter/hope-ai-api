import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  StaffScopedAtomicResult
} from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  createStaffIdentity
} from "../../src/services/staff/staffCommands";

const tenant = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const object = "c1717a19-c719-4ed2-8b72-e013800095de";

const input = {
  displayName: "Synthetic New Staff",
  actorId: "synthetic-admin",
  entraTenantId: tenant,
  entraObjectId: object
};

const fixed = {
  now: () => "2026-11-09T12:00:00.000Z",
  newEventId: () => "evt-create-test",
  newStaffId: () => "staff-create-test"
};

class SyntheticRepository {
  readonly events: StaffEvent[] = [];

  async listAll(): Promise<StaffEvent[]> {
    return [...this.events];
  }

  async append(event: StaffEvent): Promise<void> {
    this.events.push(event);
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

    const outcome = await createStaffIdentity(input, {
      ...fixed,
      repository: repository as any,
      atomicCreation: async () => {
        calls++;
        return decision("committed");
      }
    });

    assert.equal(outcome.accepted, true);
    assert.equal(calls, 0);
    assert.equal(repository.events.length, 1);
    assert.equal(repository.events[0].type, "staff.created");
    console.log("[PASS] Default-off legacy creation preserved");
  }

  {
    const repository = new SyntheticRepository();

    const outcome = await createStaffIdentity(input, {
      ...fixed,
      repository: repository as any,
      atomicCreationEnabled: true
    });

    assert.deepEqual(outcome, {
      accepted: false,
      status: 503,
      error: "Coordinated Staff creation writer unavailable"
    });
    assert.equal(repository.events.length, 0);
    console.log("[PASS] Missing creation coordinator fails closed");
  }

  {
    const repository = new SyntheticRepository();
    let observed: StaffEvent | undefined;
    let calls = 0;

    const outcome = await createStaffIdentity(input, {
      ...fixed,
      repository: repository as any,
      atomicCreationEnabled: true,
      atomicCreation: async event => {
        calls++;
        observed = event;
        return decision("committed");
      }
    });

    assert.deepEqual(outcome, {
      accepted: true,
      eventId: "evt-create-test",
      staffId: "staff-create-test",
      type: "staff.created"
    });
    assert.equal(calls, 1);
    assert.equal(repository.events.length, 0);
    assert.equal(observed?.type, "staff.created");
    assert.equal(observed?.data.entraTenantId, tenant);
    assert.equal(observed?.data.entraObjectId, object);
    console.log("[PASS] Injected coordinated result avoids double append");
  }

  {
    const repository = new SyntheticRepository();

    const outcome = await createStaffIdentity(input, {
      ...fixed,
      repository: repository as any,
      atomicCreationEnabled: true,
      atomicCreation: async () => decision("denied")
    });

    assert.deepEqual(outcome, {
      accepted: false,
      status: 409,
      error: "Coordinated Staff creation denied"
    });
    assert.equal(repository.events.length, 0);
    console.log("[PASS] Denied creation has no legacy fallback");
  }

  {
    const repository = new SyntheticRepository();
    let calls = 0;

    const outcome = await createStaffIdentity(input, {
      ...fixed,
      repository: repository as any,
      atomicCreationEnabled: true,
      atomicCreation: async () => {
        calls++;
        return decision("uncertain");
      }
    });

    assert.deepEqual(outcome, {
      accepted: false,
      status: 503,
      error: "Coordinated Staff creation outcome uncertain"
    });
    assert.equal(calls, 1);
    assert.equal(repository.events.length, 0);
    console.log("[PASS] Uncertain creation has no retry or append");
  }

  {
    const repository = new SyntheticRepository();

    const outcome = await createStaffIdentity(input, {
      ...fixed,
      repository: repository as any,
      atomicCreationEnabled: true,
      atomicCreation: async () => {
        throw new Error("synthetic lost acknowledgment");
      }
    });

    assert.equal(outcome.accepted, false);
    if (!outcome.accepted) {
      assert.equal(outcome.status, 503);
    }
    assert.equal(repository.events.length, 0);
    console.log("[PASS] Coordinator exception fails closed");
  }

  {
    const repository = new SyntheticRepository();

    const outcome = await createStaffIdentity(input, {
      ...fixed,
      repository: repository as any,
      atomicCreationEnabled: true,
      atomicCreation: async () => ({
        ...decision("committed"),
        retryPermitted: true
      } as unknown as StaffScopedAtomicResult)
    });

    assert.deepEqual(outcome, {
      accepted: false,
      status: 503,
      error: "Coordinated Staff creation result invalid"
    });
    assert.equal(repository.events.length, 0);
    console.log("[PASS] Invalid retry authority rejected");
  }

  {
    const repository = new SyntheticRepository();
    let calls = 0;

    const outcome = await createStaffIdentity({
      ...input,
      displayName: ""
    }, {
      ...fixed,
      repository: repository as any,
      atomicCreationEnabled: true,
      atomicCreation: async () => {
        calls++;
        return decision("committed");
      }
    });

    assert.equal(outcome.accepted, false);
    if (!outcome.accepted) {
      assert.equal(outcome.status, 400);
    }
    assert.equal(calls, 0);
    assert.equal(repository.events.length, 0);
    console.log("[PASS] Input validation precedes coordinator");
  }

  console.log("[PASS] Staff creation participation regressions");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});