import assert from "node:assert/strict";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  ReservationEvidence
} from "../../src/repositories/oauthStaffSecurityStorageRepository";
import type {
  StaffCreationEvidence
} from "../../src/repositories/inspectStaffCreationEvidence";
import {
  reconcileStaffCreationEvidence,
  type StaffCreationReconciliationPorts,
  type StaffCreationReconciliationResult
} from "../../src/services/staff/reconcileStaffCreationEvidence";

const tenant = "11111111-1111-4111-8111-111111111111";
const object = "22222222-2222-4222-8222-222222222222";
const operation = "33333333-3333-4333-8333-333333333333";

const event: StaffEvent = {
  eventId: "evt-reconcile-104",
  staffId: "staff-reconcile-104",
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

function binding(
  status: ReservationEvidence["status"]
): ReservationEvidence {
  return {
    status,
    executionPermitted: false,
    retryPermitted: false
  };
}

function canonical(
  status: StaffCreationEvidence["status"]
): StaffCreationEvidence {
  return {
    status,
    executionPermitted: false,
    retryPermitted: false,
    automaticRecoveryPermitted: false,
    productionWriterFenced: false,
    authoritative: false
  };
}

function ports(
  b: ReservationEvidence["status"],
  c: StaffCreationEvidence["status"],
  calls: string[]
): StaffCreationReconciliationPorts {
  return {
    inspectReservation: async request => {
      calls.push("binding");
      assert.deepEqual(request, {
        tenantId: tenant,
        objectId: object,
        staffId: event.staffId,
        operationId: operation
      });
      return binding(b);
    },
    inspectCanonical: async received => {
      calls.push("canonical");
      assert.deepEqual(received, event);
      return canonical(c);
    }
  };
}

function noAuthority(value: StaffCreationReconciliationResult) {
  assert.equal(value.reconciliationRequired, true);
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.reservationReleasePermitted, false);
  assert.equal(value.productionWriterFenced, false);
  assert.equal(value.productionRolloutPermitted, false);
}

async function main(): Promise<void> {
  {
    const calls: string[] = [];
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      ports("observed_consistent", "observed_creation", calls)
    );
    assert.equal(outcome.status, "not_evaluated");
    assert.equal(calls.length, 0);
    noAuthority(outcome);
    console.log("[PASS] Default-disabled makes zero reads");
  }

  {
    const calls: string[] = [];
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      ports("observed_consistent", "observed_creation", calls),
      true
    );
    assert.equal(outcome.status, "observed_both");
    assert.deepEqual(calls, ["binding", "canonical"]);
    noAuthority(outcome);
    console.log("[PASS] Both evidence readers match without authority");
  }

  {
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      ports("observed_historical", "observed_creation", []),
      true
    );
    assert.equal(outcome.status, "historical_binding");
    noAuthority(outcome);
    console.log("[PASS] Historical binding does not imply current ownership");
  }

  {
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      ports("observed_consistent", "absent_or_unavailable", []),
      true
    );
    assert.equal(outcome.status, "incomplete_or_unavailable");
    noAuthority(outcome);
    console.log("[PASS] Missing canonical evidence remains unresolved");
  }

  {
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      ports("absent_or_unavailable", "observed_creation", []),
      true
    );
    assert.equal(outcome.status, "incomplete_or_unavailable");
    noAuthority(outcome);
    console.log("[PASS] Missing binding evidence remains unresolved");
  }

  {
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      ports("inconsistent", "observed_creation", []),
      true
    );
    assert.equal(outcome.status, "conflicting");
    noAuthority(outcome);
    console.log("[PASS] Conflicting binding evidence rejected");
  }

  {
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      ports("observed_consistent", "inconsistent", []),
      true
    );
    assert.equal(outcome.status, "conflicting");
    noAuthority(outcome);
    console.log("[PASS] Conflicting canonical evidence rejected");
  }

  {
    let canonicalCalls = 0;
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      {
        inspectReservation: async () => {
          throw new Error("binding read unavailable");
        },
        inspectCanonical: async () => {
          canonicalCalls++;
          return canonical("observed_creation");
        }
      },
      true
    );
    assert.equal(outcome.status, "uncertain");
    assert.equal(canonicalCalls, 1);
    noAuthority(outcome);
    console.log("[PASS] Reader exception preserves uncertainty");
  }

  {
    let calls = 0;
    const outcome = await reconcileStaffCreationEvidence(
      event, operation,
      {
        inspectReservation: async () => {
          calls++;
          return {
            ...binding("observed_consistent"),
            executionPermitted: true
          } as unknown as ReservationEvidence;
        },
        inspectCanonical: async () => {
          calls++;
          return canonical("observed_creation");
        }
      },
      true
    );
    assert.equal(outcome.status, "uncertain");
    assert.equal(calls, 2);
    noAuthority(outcome);
    console.log("[PASS] Invalid authority flags fail closed");
  }

  {
    let calls = 0;
    const outcome = await reconcileStaffCreationEvidence(
      event, "invalid",
      {
        inspectReservation: async () => {
          calls++;
          return binding("observed_consistent");
        },
        inspectCanonical: async () => {
          calls++;
          return canonical("observed_creation");
        }
      },
      true
    );
    assert.equal(outcome.status, "invalid_input");
    assert.equal(calls, 0);
    noAuthority(outcome);
    console.log("[PASS] Invalid operation rejected before reads");
  }

  console.log("[PASS] Cross-partition creation reconciliation regressions");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});