import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  BindingReservationResult,
  BindingReservationRequest
} from "../../src/repositories/oauthStaffSecurityStorageRepository";
import type {
  StaffScopedAtomicResult
} from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  coordinateStaffCreation,
  type StaffCreationCoordinationPorts,
  type StaffCreationCoordinationResult
} from "../../src/services/staff/coordinateStaffCreation";

const tenant = "11111111-1111-4111-8111-111111111111";
const object = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";

const event: StaffEvent = {
  eventId: "evt-coordinate-001",
  staffId: "staff-coordinate-001",
  actorId: "staff-admin",
  type: "staff.created",
  occurredAt: "2026-11-09T12:00:00.000Z",
  data: {
    displayName: "Synthetic Staff",
    status: "active",
    entraTenantId: tenant,
    entraObjectId: object
  }
};

function reserved(
  status: BindingReservationResult["status"] = "committed"
): BindingReservationResult {
  if (status === "committed") {
    return {
      status,
      revision: 1,
      executionPermitted: false,
      retryPermitted: false
    };
  }
  return {
    status,
    executionPermitted: false,
    retryPermitted: false
  };
}

function created(
  status: StaffScopedAtomicResult["status"] = "committed"
): StaffScopedAtomicResult {
  return {
    status,
    executionPermitted: false,
    retryPermitted: false,
    productionWriterFenced: false
  };
}

function assertNeverAuthorizes(
  value: StaffCreationCoordinationResult
): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.productionWriterFenced, false);
  assert.equal(value.productionRolloutPermitted, false);
}

async function main(): Promise<void> {
  {
    let reservations = 0;
    let creations = 0;

    const outcome = await coordinateStaffCreation(
      event,
      operationId,
      {
        reserveBinding: async () => {
          reservations++;
          return reserved();
        },
        createCanonical: async () => {
          creations++;
          return created();
        }
      }
    );

    assert.equal(outcome.status, "denied");
    assert.equal(outcome.stage, "not_started");
    assert.equal(reservations, 0);
    assert.equal(creations, 0);
    assertNeverAuthorizes(outcome);
    console.log("[PASS] Default-disabled performs zero operations");
  }

  {
    const order: string[] = [];
    let observedReservation: BindingReservationRequest | null = null;
    let observedEvent: StaffEvent | null = null;

    const ports: StaffCreationCoordinationPorts = {
      reserveBinding: async request => {
        order.push("reserve");
        observedReservation = request;
        return reserved();
      },
      createCanonical: async input => {
        order.push("create");
        observedEvent = input;
        return created();
      }
    };

    const outcome = await coordinateStaffCreation(
      event, operationId, ports, true
    );

    assert.equal(outcome.status, "both_acknowledged");
    assert.equal(outcome.stage, "both_acknowledged");
    assert.equal(outcome.reconciliationRequired, true);
    assert.deepEqual(order, ["reserve", "create"]);
    assert.deepEqual(observedReservation, {
      tenantId: tenant,
      objectId: object,
      staffId: event.staffId,
      operationId
    });
    assert.deepEqual(observedEvent, event);
    assertNeverAuthorizes(outcome);
    console.log("[PASS] Both acknowledgements preserve execution order");
  }

  {
    let creations = 0;
    const outcome = await coordinateStaffCreation(
      event, operationId,
      {
        reserveBinding: async () => reserved("conflict"),
        createCanonical: async () => {
          creations++;
          return created();
        }
      },
      true
    );

    assert.equal(outcome.status, "denied");
    assert.equal(creations, 0);
    assertNeverAuthorizes(outcome);
    console.log("[PASS] Competing binding claim blocks creation");
  }

  {
    let creations = 0;
    const outcome = await coordinateStaffCreation(
      event, operationId,
      {
        reserveBinding: async () => reserved("uncertain"),
        createCanonical: async () => {
          creations++;
          return created();
        }
      },
      true
    );

    assert.equal(outcome.status, "uncertain");
    assert.equal(outcome.stage, "reservation");
    assert.equal(outcome.reconciliationRequired, true);
    assert.equal(creations, 0);
    console.log("[PASS] Uncertain reservation never starts creation");
  }

  {
    let creations = 0;
    const outcome = await coordinateStaffCreation(
      event, operationId,
      {
        reserveBinding: async () => {
          throw new Error("lost reservation acknowledgement");
        },
        createCanonical: async () => {
          creations++;
          return created();
        }
      },
      true
    );

    assert.equal(outcome.status, "uncertain");
    assert.equal(creations, 0);
    console.log("[PASS] Reservation exception causes no retry");
  }

  {
    const outcome = await coordinateStaffCreation(
      event, operationId,
      {
        reserveBinding: async () => reserved(),
        createCanonical: async () => created("denied")
      },
      true
    );

    assert.equal(outcome.status, "uncertain");
    assert.equal(outcome.stage, "canonical_creation");
    assert.equal(outcome.reconciliationRequired, true);
    assertNeverAuthorizes(outcome);
    console.log("[PASS] Denied creation after reservation requires reconciliation");
  }

  {
    const outcome = await coordinateStaffCreation(
      event, operationId,
      {
        reserveBinding: async () => reserved(),
        createCanonical: async () => {
          throw new Error("lost canonical acknowledgement");
        }
      },
      true
    );

    assert.equal(outcome.status, "uncertain");
    assert.equal(outcome.reconciliationRequired, true);
    console.log("[PASS] Canonical exception preserves uncertainty");
  }

  {
    let calls = 0;
    const outcome = await coordinateStaffCreation(
      {
        ...event,
        data: {
          ...event.data,
          entraObjectId: null
        }
      },
      operationId,
      {
        reserveBinding: async () => {
          calls++;
          return reserved();
        },
        createCanonical: async () => {
          calls++;
          return created();
        }
      },
      true
    );

    assert.equal(outcome.status, "denied");
    assert.equal(calls, 0);
    console.log("[PASS] Invalid binding rejected before storage");
  }

  {
    let calls = 0;
    const outcome = await coordinateStaffCreation(
      event,
      "invalid-operation-id",
      {
        reserveBinding: async () => {
          calls++;
          return reserved();
        },
        createCanonical: async () => {
          calls++;
          return created();
        }
      },
      true
    );

    assert.equal(outcome.status, "denied");
    assert.equal(calls, 0);
    console.log("[PASS] Invalid operation ID rejected");
  }

  {
    let creations = 0;
    const outcome = await coordinateStaffCreation(
      event, operationId,
      {
        reserveBinding: async () => ({
          ...reserved(),
          executionPermitted: true
        } as unknown as BindingReservationResult),
        createCanonical: async () => {
          creations++;
          return created();
        }
      },
      true
    );

    assert.equal(outcome.status, "uncertain");
    assert.equal(creations, 0);
    assertNeverAuthorizes(outcome);
    console.log("[PASS] Invalid reservation authority flags rejected");
  }

  {
    const outcome = await coordinateStaffCreation(
      event, operationId,
      {
        reserveBinding: async () => reserved(),
        createCanonical: async () => ({
          ...created(),
          productionWriterFenced: true
        } as unknown as StaffScopedAtomicResult)
      },
      true
    );

    assert.equal(outcome.status, "uncertain");
    assertNeverAuthorizes(outcome);
    console.log("[PASS] Invalid canonical fencing claim rejected");
  }

  console.log("[PASS] Cross-partition Staff creation coordination regressions");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});