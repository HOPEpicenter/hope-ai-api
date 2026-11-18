import assert from "node:assert/strict";

import {
  coordinateStaffCreation,
  type StaffCreationCoordinationPorts
} from "../../src/services/staff/coordinateStaffCreation";

const event = {
  eventId: "evt-kiosk-mandatory-readback",
  staffId: "staff-kiosk-mandatory-readback",
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

async function main(): Promise<void> {
  const previousSite = process.env.WEBSITE_SITE_NAME;

  try {
    process.env.WEBSITE_SITE_NAME =
      "hope-kiosk-acceptance-api";

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

    // Even an explicit false must not bypass the kiosk readback.
    const missing = await coordinateStaffCreation(
      event,
      "33333333-3333-4333-8333-333333333333",
      ports,
      true,
      false
    );

    assert.equal(missing.status, "uncertain");
    assert.equal(missing.reconciliationRequired, true);
    assert.equal(creations, 0);

    console.log("KIOSK_FALSE_OVERRIDE_DENIED=True");

    ports.inspectReservation = async () => {
      inspections++;
      return {
        status: "observed_historical",
        executionPermitted: false,
        retryPermitted: false
      };
    };

    const historical = await coordinateStaffCreation(
      event,
      "33333333-3333-4333-8333-333333333333",
      ports,
      true,
      false
    );

    assert.equal(historical.status, "uncertain");
    assert.equal(creations, 0);

    console.log("HISTORICAL_BINDING_BLOCKS_CREATION=True");

    ports.inspectReservation = async () => {
      inspections++;
      return {
        status: "observed_consistent",
        executionPermitted: false,
        retryPermitted: false
      };
    };

    const consistent = await coordinateStaffCreation(
      event,
      "33333333-3333-4333-8333-333333333333",
      ports,
      true,
      false
    );

    assert.equal(consistent.status, "both_acknowledged");
    assert.equal(consistent.reconciliationRequired, true);
    assert.equal(consistent.authoritative, false);
    assert.equal(consistent.executionPermitted, false);
    assert.equal(consistent.productionWriterFenced, false);
    assert.equal(creations, 1);
    assert.equal(inspections, 2);

    console.log("KIOSK_READBACK_MANDATORY=True");
    console.log("COORDINATOR_REMAINS_NON_AUTHORIZING=True");
    console.log("K358FQ_TESTS_PASSED=True");
  } finally {
    if (previousSite === undefined) {
      delete process.env.WEBSITE_SITE_NAME;
    } else {
      process.env.WEBSITE_SITE_NAME = previousSite;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
