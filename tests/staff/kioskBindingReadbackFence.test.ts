import assert from "node:assert/strict";
import {
  coordinateStaffCreation
} from "../../src/services/staff/coordinateStaffCreation";
import type {
  StaffCreationCoordinationPorts
} from "../../src/services/staff/coordinateStaffCreation";

const event = {
  eventId: "evt-kiosk-readback",
  staffId: "staff-kiosk-readback",
  actorId: "synthetic-actor",
  type: "staff.created" as const,
  occurredAt: "2026-11-17T12:00:00.000Z",
  data: {
    displayName: "Synthetic Staff",
    status: "active" as const,
    entraTenantId: "11111111-1111-4111-8111-111111111111",
    entraObjectId: "22222222-2222-4222-8222-222222222222"
  }
};

const operationId = "33333333-3333-4333-8333-333333333333";

async function run(
  observation: "observed_consistent" |
    "observed_historical" |
    "absent_or_unavailable" |
    "inconsistent",
  readerFails = false,
  readerPresent = true
) {
  let creations = 0;
  let inspections = 0;

  const ports: StaffCreationCoordinationPorts = {
    reserveBinding: async () => ({
      status: "committed",
      revision: 1,
      executionPermitted: false,
      retryPermitted: false
    }),
    createCanonical: async () => {
      creations++;
      return {
        status: "committed",
        executionPermitted: false,
        retryPermitted: false,
        productionWriterFenced: false
      };
    }
  };

  if (readerPresent) {
    ports.inspectReservation = async () => {
      inspections++;

      if (readerFails) {
        throw new Error("SYNTHETIC_READ_FAILURE");
      }

      return {
        status: observation,
        executionPermitted: false,
        retryPermitted: false
      };
    };
  }

  const result = await coordinateStaffCreation(
    event,
    operationId,
    ports,
    true,
    true
  );

  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.authoritative, false);
  assert.equal(result.productionWriterFenced, false);
  assert.equal(result.reconciliationRequired, true);

  return { result, creations, inspections };
}

async function main(): Promise<void> {
  for (const status of [
    "observed_historical",
    "absent_or_unavailable",
    "inconsistent"
  ] as const) {
    const outcome = await run(status);
    assert.equal(outcome.result.status, "uncertain");
    assert.equal(outcome.creations, 0);
  }

  console.log("UNVERIFIED_BINDING_BLOCKS_CREATION=True");

  const failedRead = await run(
    "observed_consistent", true
  );
  assert.equal(failedRead.result.status, "uncertain");
  assert.equal(failedRead.creations, 0);

  const missingReader = await run(
    "observed_consistent", false, false
  );
  assert.equal(missingReader.result.status, "uncertain");
  assert.equal(missingReader.creations, 0);

  console.log("MISSING_OR_FAILED_READER_DENIED=True");

  const consistent = await run("observed_consistent");
  assert.equal(
    consistent.result.status,
    "both_acknowledged"
  );
  assert.equal(consistent.inspections, 1);
  assert.equal(consistent.creations, 1);

  console.log("CONSISTENT_SYNTHETIC_READBACK_OBSERVED=True");
  console.log("COORDINATOR_STILL_NON_AUTHORIZING=True");
  console.log("K358FM_READBACK_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
