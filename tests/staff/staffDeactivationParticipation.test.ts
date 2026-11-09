import assert from "node:assert/strict";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";
import type { StaffScopedAtomicResult } from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  updateStaffIdentity
} from "../../src/services/staff/staffCommands";

class SyntheticStaffRepository {
  readonly events: StaffEvent[] = [];

  constructor() {
    this.events.push({
      eventId: "seed-event",
      staffId: "synthetic-staff",
      type: "staff.created",
      occurredAt: "2026-11-09T10:00:00.000Z",
      actorId: "synthetic-admin",
      data: {
        displayName: "Synthetic Staff",
        status: "active"
      }
    });
  }

  async append(event: StaffEvent): Promise<void> {
    this.events.push(event);
  }

  async listAll(): Promise<StaffEvent[]> {
    return [...this.events];
  }
}

const baseInput = {
  staffId: "synthetic-staff",
  status: "inactive" as const,
  reason: "Synthetic deactivation",
  actorId: "synthetic-admin"
};

const fixed = {
  now: () => "2026-11-09T11:00:00.000Z",
  newEventId: () => "synthetic-deactivate-event"
};

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
  // Existing behavior must remain unchanged by default.
  {
    const repository = new SyntheticStaffRepository();
    let calls = 0;

    const result = await updateStaffIdentity(baseInput, {
      ...fixed,
      repository: repository as any,
      atomicDeactivation: async () => {
        calls++;
        return decision("committed");
      }
    });

    assert.equal(result.accepted, true);
    assert.equal(calls, 0);
    assert.equal(repository.events.length, 2);
    assert.equal(repository.events[1].type, "staff.deactivated");
    console.log("[PASS] Default-off legacy behavior preserved");
  }

  // Explicit enablement requires an injected atomic writer.
  {
    const repository = new SyntheticStaffRepository();

    const result = await updateStaffIdentity(baseInput, {
      ...fixed,
      repository: repository as any,
      atomicDeactivationEnabled: true
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 503,
      error: "Atomic Staff deactivation writer unavailable"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Missing writer fails closed");
  }

  // A confirmed atomic commit must not be appended twice.
  {
    const repository = new SyntheticStaffRepository();
    let calls = 0;
    let observed: StaffEvent | undefined;

    const result = await updateStaffIdentity(baseInput, {
      ...fixed,
      repository: repository as any,
      atomicDeactivationEnabled: true,
      atomicDeactivation: async event => {
        calls++;
        observed = event;
        return decision("committed");
      }
    });

    assert.equal(result.accepted, true);
    assert.equal(calls, 1);
    assert.equal(repository.events.length, 1);
    assert.equal(observed?.eventId, "synthetic-deactivate-event");
    assert.equal(observed?.type, "staff.deactivated");
    assert.deepEqual(observed?.data, {
      status: "inactive",
      reason: "Synthetic deactivation"
    });
    console.log("[PASS] Atomic commit acknowledged without double append");
  }

  // Known storage conflicts cannot fall back to the old writer.
  {
    const repository = new SyntheticStaffRepository();

    const result = await updateStaffIdentity(baseInput, {
      ...fixed,
      repository: repository as any,
      atomicDeactivationEnabled: true,
      atomicDeactivation: async () => decision("denied")
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 409,
      error: "Atomic Staff deactivation denied"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Denied transition never falls back");
  }

  // Ambiguous commits cannot be retried by this command.
  {
    const repository = new SyntheticStaffRepository();

    const result = await updateStaffIdentity(baseInput, {
      ...fixed,
      repository: repository as any,
      atomicDeactivationEnabled: true,
      atomicDeactivation: async () => decision("uncertain")
    });

    assert.equal(result.accepted, false);
    if (!result.accepted) {
      assert.equal(result.status, 503);
    }
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Uncertain transition never falls back");
  }

  // Storage exceptions must not trigger an alternate append.
  {
    const repository = new SyntheticStaffRepository();

    const result = await updateStaffIdentity(baseInput, {
      ...fixed,
      repository: repository as any,
      atomicDeactivationEnabled: true,
      atomicDeactivation: async () => {
        throw new Error("synthetic storage outage");
      }
    });

    assert.equal(result.accepted, false);
    if (!result.accepted) {
      assert.equal(result.status, 503);
    }
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Writer exception fails closed");
  }

  // A malformed, supposedly authorizing response is rejected.
  {
    const repository = new SyntheticStaffRepository();

    const result = await updateStaffIdentity(baseInput, {
      ...fixed,
      repository: repository as any,
      atomicDeactivationEnabled: true,
      atomicDeactivation: async () => ({
        status: "committed",
        executionPermitted: true,
        retryPermitted: false,
        productionWriterFenced: false
      } as unknown as StaffScopedAtomicResult)
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 503,
      error: "Atomic Staff deactivation result invalid"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Invalid authorization flags rejected");
  }

  // Ordinary profile changes are not routed into deactivation.
  {
    const repository = new SyntheticStaffRepository();
    let calls = 0;

    const result = await updateStaffIdentity({
      staffId: "synthetic-staff",
      displayName: "Updated Synthetic Staff",
      actorId: "synthetic-admin"
    }, {
      ...fixed,
      repository: repository as any,
      atomicDeactivationEnabled: true,
      atomicDeactivation: async () => {
        calls++;
        return decision("committed");
      }
    });

    assert.equal(result.accepted, true);
    assert.equal(calls, 0);
    assert.equal(repository.events.length, 2);
    assert.equal(repository.events[1].type, "staff.updated");
    console.log("[PASS] Profile update behavior preserved");
  }

  console.log("[PASS] Staff deactivation participation regressions");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});