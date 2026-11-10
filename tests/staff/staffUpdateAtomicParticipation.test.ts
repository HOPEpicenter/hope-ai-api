import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  StaffScopedAtomicResult
} from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  updateStaffIdentity
} from "../../src/services/staff/staffCommands";

class SyntheticRepository {
  readonly events: StaffEvent[] = [{
    eventId: "seed-created",
    staffId: "synthetic-staff",
    type: "staff.created",
    occurredAt: "2026-11-09T10:00:00.000Z",
    actorId: "synthetic-admin",
    data: {
      displayName: "Synthetic Staff",
      status: "active"
    }
  }];

  async append(event: StaffEvent): Promise<void> {
    this.events.push(event);
  }

  async listAll(): Promise<StaffEvent[]> {
    return [...this.events];
  }
}

const update = {
  staffId: "synthetic-staff",
  displayName: "Updated Synthetic Staff",
  actorId: "synthetic-admin"
};

const deactivate = {
  staffId: "synthetic-staff",
  status: "inactive" as const,
  actorId: "synthetic-admin"
};

const fixed = {
  now: () => "2026-11-09T11:00:00.000Z",
  newEventId: () => "synthetic-update-event"
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
  // Default-off must retain the existing canonical append.
  {
    const repository = new SyntheticRepository();
    let calls = 0;

    const result = await updateStaffIdentity(update, {
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
    assert.equal(repository.events[1].type, "staff.updated");
    console.log("[PASS] Default-off legacy update preserved");
  }

  // Selected participation must have an injected writer.
  {
    const repository = new SyntheticRepository();
    const result = await updateStaffIdentity(update, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 503,
      error: "Atomic Staff mutation writer unavailable"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Missing writer fails closed");
  }

  // A committed result must not append a duplicate event.
  {
    const repository = new SyntheticRepository();
    let calls = 0;
    let observed: StaffEvent | undefined;

    const result = await updateStaffIdentity(update, {
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
      eventId: "synthetic-update-event",
      staffId: "synthetic-staff",
      type: "staff.updated"
    });
    assert.equal(calls, 1);
    assert.equal(repository.events.length, 1);
    assert.equal(observed?.type, "staff.updated");
    assert.equal(
      observed?.data.displayName,
      "Updated Synthetic Staff"
    );
    console.log("[PASS] Atomic update acknowledged once");
  }

  // Denied mutation never falls back.
  {
    const repository = new SyntheticRepository();

    const result = await updateStaffIdentity(update, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => decision("denied")
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 409,
      error: "Atomic Staff mutation denied"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Denied mutation has no fallback");
  }

  // Ambiguous transaction never falls back or retries.
  {
    const repository = new SyntheticRepository();
    let calls = 0;

    const result = await updateStaffIdentity(update, {
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
      error: "Atomic Staff mutation outcome uncertain"
    });
    assert.equal(calls, 1);
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Uncertain mutation has no fallback");
  }

  // Writer exceptions are ambiguous, not permission to append.
  {
    const repository = new SyntheticRepository();

    const result = await updateStaffIdentity(update, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => {
        throw new Error("synthetic storage failure");
      }
    });

    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 503);
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Writer exception fails closed");
  }

  // Result must never claim execution, retry, or fencing.
  {
    const repository = new SyntheticRepository();

    const result = await updateStaffIdentity(update, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => ({
        ...decision("committed"),
        executionPermitted: true
      } as unknown as StaffScopedAtomicResult)
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 503,
      error: "Atomic Staff mutation result invalid"
    });
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Invalid authority flags rejected");
  }

  // A selected deactivation must not be rerouted to update.
  {
    const repository = new SyntheticRepository();
    let mutationCalls = 0;

    const result = await updateStaffIdentity(deactivate, {
      ...fixed,
      repository: repository as any,
      atomicMutationEnabled: true,
      atomicMutation: async () => {
        mutationCalls++;
        return decision("committed");
      },
      atomicDeactivationEnabled: true
    });

    assert.deepEqual(result, {
      accepted: false,
      status: 503,
      error: "Atomic Staff deactivation writer unavailable"
    });
    assert.equal(mutationCalls, 0);
    assert.equal(repository.events.length, 1);
    console.log("[PASS] Deactivation remains separate");
  }

  // Existing update rules and input validation still apply.
  {
    const repository = new SyntheticRepository();
    let calls = 0;

    const result = await updateStaffIdentity({
      staffId: "synthetic-staff",
      actorId: "synthetic-admin",
      displayName: ""
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
    console.log("[PASS] Existing input validation preserved");
  }

  console.log("[PASS] Staff update atomic participation regressions");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});