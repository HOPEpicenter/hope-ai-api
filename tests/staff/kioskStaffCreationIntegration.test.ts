import assert from "node:assert/strict";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";
import type {
  KioskStaffCreationTestPorts
} from "../../src/services/staff/kioskStaffCreationIntegration";
import {
  integrateKioskStaffCreationTestOnly
} from "../../src/services/staff/kioskStaffCreationIntegration";

const event: StaffEvent = {
  eventId: "evt-kiosk-integration",
  staffId: "staff-kiosk-integration",
  actorId: "synthetic-actor",
  type: "staff.created",
  occurredAt: "2026-11-17T12:00:00.000Z",
  data: {
    displayName: "Synthetic Staff",
    status: "active",
    entraTenantId: "11111111-1111-4111-8111-111111111111",
    entraObjectId: "22222222-2222-4222-8222-222222222222"
  }
};

const operationId = "33333333-3333-4333-8333-333333333333";

async function main(): Promise<void> {
  const keys = [
    "NODE_ENV",
    "HOPE_KIOSK_BOOTSTRAP_TEST_ONLY",
    "WEBSITE_SITE_NAME"
  ] as const;

  const before = Object.fromEntries(
    keys.map(key => [key, process.env[key]])
  );

  const order: string[] = [];
  let evidenceStatus:
    "observed_consistent" | "observed_historical" =
      "observed_consistent";

  const ports: KioskStaffCreationTestPorts = {
    security: {
      reserveBinding: async () => {
        order.push("reserve");
        return {
          status: "committed",
          revision: 1,
          executionPermitted: false,
          retryPermitted: false
        };
      },

      inspectReservation: async () => {
        order.push("inspect");
        return {
          status: evidenceStatus,
          executionPermitted: false,
          retryPermitted: false
        };
      }
    },
    canonical: {
      submitTransaction: async actions => {
        order.push("canonical");
        assert.equal(actions.length, 3);
        assert.ok(actions.every(action =>
          action[1].partitionKey === event.staffId
        ));
        return {};
      }
    }
  };

  try {
    process.env.NODE_ENV = "test";
    process.env.HOPE_KIOSK_BOOTSTRAP_TEST_ONLY = "true";
    delete process.env.WEBSITE_SITE_NAME;

    const disabled =
      await integrateKioskStaffCreationTestOnly(
        event, operationId, ports
      );

    assert.equal(disabled.status, "denied");
    assert.deepEqual(order, []);

    process.env.WEBSITE_SITE_NAME =
      "hope-kiosk-acceptance-api";

    const liveSiteDenied =
      await integrateKioskStaffCreationTestOnly(
        event, operationId, ports, true
      );

    assert.equal(liveSiteDenied.status, "denied");
    assert.deepEqual(order, []);

    delete process.env.WEBSITE_SITE_NAME;

    const otherSiteDenied =
      await integrateKioskStaffCreationTestOnly(
        event, operationId, ports, false
      );

    assert.equal(otherSiteDenied.status, "denied");
    assert.deepEqual(order, []);

    evidenceStatus = "observed_historical";

    const historical =
      await integrateKioskStaffCreationTestOnly(
        event, operationId, ports, true
      );

    assert.equal(historical.status, "uncertain");
    assert.deepEqual(order, ["reserve", "inspect"]);

    order.length = 0;
    evidenceStatus = "observed_consistent";

    const completed =
      await integrateKioskStaffCreationTestOnly(
        event, operationId, ports, true
      );

    assert.equal(completed.status, "both_acknowledged");
    assert.deepEqual(
      order, ["reserve", "inspect", "canonical"]
    );
    assert.equal(completed.reconciliationRequired, true);
    assert.equal(completed.authoritative, false);
    assert.equal(completed.executionPermitted, false);
    assert.equal(completed.retryPermitted, false);
    assert.equal(completed.productionWriterFenced, false);
    assert.equal(completed.productionRolloutPermitted, false);

    console.log("DEFAULT_DISABLED=True");
    console.log("LIVE_AZURE_SITE_DENIED=True");
    console.log("HISTORICAL_RESERVATION_BLOCKED=True");
    console.log("RESERVE_READBACK_CANONICAL_ORDER_VERIFIED=True");
    console.log("NO_LIVE_STORAGE_REQUESTS=True");
    console.log("INTEGRATION_NON_AUTHORIZING=True");
    console.log("K358FU_TESTS_PASSED=True");
  } finally {
    for (const key of keys) {
      const value = before[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
