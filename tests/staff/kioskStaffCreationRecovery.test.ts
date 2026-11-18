import assert from "node:assert/strict";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";
import {
  reconcileKioskStaffCreationTestOnly
} from "../../src/services/staff/kioskStaffCreationIntegration";
import type {
  KioskStaffCreationTestPorts
} from "../../src/services/staff/kioskStaffCreationIntegration";

const event: StaffEvent = {
  eventId: "evt-kiosk-recovery",
  staffId: "staff-kiosk-recovery",
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

  let bindingStatus:
    "observed_consistent" | "observed_historical" =
      "observed_consistent";

  let canonicalMissing = false;
  let canonicalConflict = false;
  let reads = 0;

  const security: KioskStaffCreationTestPorts["security"] = {
    reserveBinding: async () => {
      throw new Error("RESERVATION_WRITE_FORBIDDEN");
    },

    inspectReservation: async () => {
      reads++;
      return {
        status: bindingStatus,
        executionPermitted: false,
        retryPermitted: false
      };
    }
  };

  const canonicalRead = {
    getEntity: async (partitionKey: string, rowKey: string) => {
      reads++;

      if (canonicalMissing) {
        throw Object.assign(new Error("Missing"), {
          statusCode: 404
        });
      }

      assert.equal(partitionKey, event.staffId);

      if (rowKey === STAFF_SECURITY_METADATA_HEAD) {
        return {
          partitionKey,
          rowKey,
          revision: 0,
          state: "active"
        };
      }

      if (
        rowKey ===
        `${event.occurredAt}__${event.eventId}`
      ) {
        return {
          partitionKey,
          rowKey,
          eventId: event.eventId,
          staffId: event.staffId,
          actorId: event.actorId,
          type: event.type,
          occurredAt: event.occurredAt,
          dataJson: JSON.stringify(event.data)
        };
      }

      if (
        rowKey ===
        `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${event.eventId}`
      ) {
        return {
          partitionKey,
          rowKey,
          eventId: event.eventId,
          staffId: event.staffId,
          kind: canonicalConflict
            ? "unexpected.kind"
            : "staff.creation.prototype",
          revision: 0
        };
      }

      throw new Error("UNEXPECTED_READ");
    }
  };

  const reconcile = (enabled = true) =>
    reconcileKioskStaffCreationTestOnly(
      event,
      operationId,
      security,
      canonicalRead,
      enabled
    );

  try {
    process.env.NODE_ENV = "test";
    process.env.HOPE_KIOSK_BOOTSTRAP_TEST_ONLY = "true";
    delete process.env.WEBSITE_SITE_NAME;

    const disabled = await reconcile(false);
    assert.equal(disabled.status, "not_evaluated");
    assert.equal(reads, 0);

    process.env.WEBSITE_SITE_NAME =
      "hope-kiosk-acceptance-api";

    const liveSite = await reconcile();
    assert.equal(liveSite.status, "not_evaluated");
    assert.equal(reads, 0);

    delete process.env.WEBSITE_SITE_NAME;

    const both = await reconcile();
    assert.equal(both.status, "observed_both");
    assert.equal(both.executionPermitted, false);
    assert.equal(both.retryPermitted, false);
    assert.equal(both.automaticRecoveryPermitted, false);
    assert.equal(both.reservationReleasePermitted, false);

    bindingStatus = "observed_historical";
    const historical = await reconcile();
    assert.equal(historical.status, "historical_binding");

    bindingStatus = "observed_consistent";
    canonicalMissing = true;
    const missing = await reconcile();
    assert.equal(missing.status, "incomplete_or_unavailable");

    canonicalMissing = false;
    canonicalConflict = true;
    const conflicting = await reconcile();
    assert.equal(conflicting.status, "conflicting");

    console.log("DEFAULT_DISABLED=True");
    console.log("LIVE_AZURE_SITE_DENIED=True");
    console.log("MATCHED_EVIDENCE_OBSERVED=True");
    console.log("HISTORICAL_BINDING_DETECTED=True");
    console.log("MISSING_EVIDENCE_UNRESOLVED=True");
    console.log("CONFLICTING_EVIDENCE_DETECTED=True");
    console.log("NO_RECOVERY_WRITES_OR_RETRIES=True");
    console.log("K358FW_RECOVERY_TESTS_PASSED=True");
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
