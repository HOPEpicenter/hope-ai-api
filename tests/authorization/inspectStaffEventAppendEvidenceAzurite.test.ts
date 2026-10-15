import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import {
  STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION,
  STAFF_EVENT_APPEND_INTENT_SOURCE
} from "../../src/contracts/staffEventAppendIntent.v1";
import {
  STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
  STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE
} from "../../src/contracts/staffEventCorrelationEvidence.v1";
import {
  StaffOperationCorrelationPrototypeRepository,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
} from "../../src/repositories/staffOperationCorrelationPrototypeRepository";
import {
  inspectStaffEventAppendEvidence
} from "../../src/services/staff/inspectStaffEventAppendEvidence";

if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true") {
  throw new Error("Azurite-only storage required");
}

const port = process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";
if (port !== "10002" && port !== "11002") {
  throw new Error("Unapproved Azurite Table port");
}

const connectionString = port === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");

function table(prefix: string): TableClient {
  return TableClient.fromConnectionString(
    connectionString,
    prefix + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );
}

function nonAuthorizing(value: {
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  securityTransactionVerified: false;
  staffEventsAppendVerified: false;
}): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.securityTransactionVerified, false);
  assert.equal(value.staffEventsAppendVerified, false);
}

async function main(): Promise<void> {
  const securityTable = table("StaffAppendSecIT");
  const eventsTable = table("StaffAppendEvtIT");

  await securityTable.createTable();

  try {
    await eventsTable.createTable();

    try {
      const repository =
        new StaffOperationCorrelationPrototypeRepository(securityTable);

      assert.equal(await repository.initializeAuthorityHead(), "initialized");

      const head = await securityTable.getEntity<{ revision: number }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
      );

      const operationId = "synthetic-append-observation";
      const staffId = "synthetic-append-staff";
      const eventId = "synthetic-append-event";

      const event = {
        eventId,
        staffId,
        type: "staff.created" as const,
        occurredAt: "2026-10-15T12:00:00.000Z",
        actorId: "synthetic-actor",
        data: { displayName: "Synthetic Staff" }
      };

      const intent = {
        schemaVersion: STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION,
        sourceIdentity: STAFF_EVENT_APPEND_INTENT_SOURCE,
        event,
        correlation: {
          schemaVersion: STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
          sourceIdentity: STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
          evidenceProvenance: "writer_supplied_metadata" as const,
          operationId,
          eventId,
          staffId,
          mutationCategory: "identity_creation",
          expectedSecurityRevision: head.revision,
          resultingSecurityRevision: head.revision + 1,
          previousStaffState: "absent",
          resultingStaffState: "active"
        }
      };

      const committed = await repository.commitOperation({
        operationId,
        eventId,
        staffId,
        mutationCategory: "identity_creation",
        expectedRevision: head.revision,
        expectedStaffState: "absent",
        resultingStaffState: "active",
        appendIntent: intent
      });

      assert.equal(committed.status, "committed");
      assert.equal(committed.retryPermitted, false);

      const inspect = (id = operationId) =>
        inspectStaffEventAppendEvidence(id, securityTable, eventsTable);

      // A matching security intent does not imply the event was persisted.
      const missingEvent = await inspect();
      assert.equal(missingEvent.status, "missing");
      nonAuthorizing(missingEvent);

      // Exact event, written independently of the security transaction.
      const eventRow = {
        partitionKey: staffId,
        rowKey: `${event.occurredAt}__${eventId}`,
        eventId,
        staffId,
        type: event.type,
        occurredAt: event.occurredAt,
        actorId: event.actorId,
        dataJson: JSON.stringify(event.data)
      };

      await eventsTable.createEntity(eventRow);

      const matching = await inspect();
      assert.equal(matching.status, "verified_match");
      nonAuthorizing(matching);

      const syntheticKey = `staff-atomic-event-${eventId}`;

      const syntheticRow = await securityTable.getEntity<
        Record<string, unknown> & { eventJson: string }
      >(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        syntheticKey
      );

      assert.equal(syntheticRow.eventJson, JSON.stringify(event));

      // A missing transaction-owned event must never be verified.
      await securityTable.deleteEntity(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        syntheticKey
      );

      const missingSynthetic = await inspect();
      assert.equal(missingSynthetic.status, "unclassified");
      nonAuthorizing(missingSynthetic);

      await securityTable.createEntity({
        partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        rowKey: syntheticKey,
        schemaVersion: 1,
        source: "staff-atomic-event-in-security-transaction-v1",
        operationId,
        eventId,
        staffId,
        mutationCategory: "identity_creation",
        resultingSecurityRevision: head.revision + 1,
        eventJson: syntheticRow.eventJson
      });

      assert.equal((await inspect()).status, "verified_match");

      // A conflicting synthetic event body must fail closed.
      await securityTable.updateEntity(
        {
          partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          rowKey: syntheticKey,
          eventJson: JSON.stringify({
            ...event,
            actorId: "different-actor"
          })
        },
        "Merge"
      );

      const conflictingSynthetic = await inspect();
      assert.equal(conflictingSynthetic.status, "contradictory");
      nonAuthorizing(conflictingSynthetic);

      // Malformed JSON is also contradictory.
      await securityTable.updateEntity(
        {
          partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          rowKey: syntheticKey,
          eventJson: "{invalid-json"
        },
        "Merge"
      );

      const malformedSynthetic = await inspect();
      assert.equal(malformedSynthetic.status, "contradictory");
      nonAuthorizing(malformedSynthetic);

      await securityTable.updateEntity(
        {
          partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          rowKey: syntheticKey,
          eventJson: syntheticRow.eventJson
        },
        "Merge"
      );

      assert.equal((await inspect()).status, "verified_match");

      // Change security evidence during the independent StaffEvents read.
      // The final inspection must detect the disagreement.
      const checkConcurrentChange = async (
        rowKey: string,
        field: string,
        altered: string,
        original: string
      ): Promise<void> => {
        const changingEvents = new Proxy(eventsTable, {
          get(target, property) {
            if (property === "getEntity") {
              return async (pk: string, rk: string) => {
                await securityTable.updateEntity(
                  {
                    partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
                    rowKey,
                    [field]: altered
                  },
                  "Merge"
                );
                return target.getEntity(pk, rk);
              };
            }
            const value = Reflect.get(target, property, target) as unknown;
            return typeof value === "function" ? value.bind(target) : value;
          }
        });

        try {
          const changed = await inspectStaffEventAppendEvidence(
            operationId,
            securityTable,
            changingEvents
          );
          assert.equal(changed.status, "contradictory");
          nonAuthorizing(changed);
        } finally {
          await securityTable.updateEntity(
            {
              partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
              rowKey,
              [field]: original
            },
            "Merge"
          );
        }

        const restored = await inspect();
        assert.equal(restored.status, "verified_match");
        nonAuthorizing(restored);
      };

      await checkConcurrentChange(
        `operation-${operationId}`,
        "appendIntentRequirement",
        "not_required",
        "required"
      );

      const intentRowKey = `staff-event-append-intent-${operationId}`;
      const storedIntentRow = await securityTable.getEntity<{
        intentJson: string
      }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        intentRowKey
      );

      await checkConcurrentChange(
        intentRowKey,
        "intentJson",
        "{invalid-json",
        storedIntentRow.intentJson
      );

      // A concurrent change to the synthetic event must be detected.
      await checkConcurrentChange(
        syntheticKey,
        "eventJson",
        "{concurrent-change",
        syntheticRow.eventJson
      );

      // A failed final security read cannot yield verified_match.
      let securityReads = 0;
      const finalReadFailure = new Proxy(securityTable, {
        get(target, property) {
          if (property === "getEntity") {
            return async (pk: string, rk: string) => {
              if (rk === `operation-${operationId}`) {
                securityReads++;
                if (securityReads === 2) {
                  throw Object.assign(new Error("synthetic final-read outage"), {
                    statusCode: 500
                  });
                }
              }
              return target.getEntity(pk, rk);
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        }
      });

      const finalFailure = await inspectStaffEventAppendEvidence(
        operationId,
        finalReadFailure,
        eventsTable
      );
      assert.equal(finalFailure.status, "unavailable");
      assert.equal(securityReads, 2);
      nonAuthorizing(finalFailure);

      // A modified event payload is not evidence of the intended append.
      await eventsTable.updateEntity(
        {
          partitionKey: staffId,
          rowKey: eventRow.rowKey,
          dataJson: JSON.stringify({ displayName: "Different Staff" })
        },
        "Merge"
      );

      const tampered = await inspect();
      assert.equal(tampered.status, "contradictory");
      nonAuthorizing(tampered);

      await eventsTable.updateEntity(
        {
          partitionKey: staffId,
          rowKey: eventRow.rowKey,
          dataJson: eventRow.dataJson
        },
        "Merge"
      );

      assert.equal((await inspect()).status, "verified_match");

      // Invalid persisted JSON must fail closed.
      await eventsTable.updateEntity(
        {
          partitionKey: staffId,
          rowKey: eventRow.rowKey,
          dataJson: "{invalid-json"
        },
        "Merge"
      );

      const malformed = await inspect();
      assert.equal(malformed.status, "contradictory");
      nonAuthorizing(malformed);

      await eventsTable.updateEntity(
        {
          partitionKey: staffId,
          rowKey: eventRow.rowKey,
          dataJson: eventRow.dataJson
        },
        "Merge"
      );

      // An independent event read outage is unavailable, not missing.
      const unavailableTable = new Proxy(eventsTable, {
        get(target, property) {
          if (property === "getEntity") {
            return async () => {
              throw Object.assign(new Error("synthetic outage"), {
                statusCode: 500
              });
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        }
      });

      const unavailable = await inspectStaffEventAppendEvidence(
        operationId,
        securityTable,
        unavailableTable
      );
      assert.equal(unavailable.status, "unavailable");
      nonAuthorizing(unavailable);

      // A metadata-only receipt has no required append intent.
      const legacyOperation = "synthetic-no-intent";
      const nextHead = await securityTable.getEntity<{ revision: number }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
      );

      const legacy = await repository.commitOperation({
        operationId: legacyOperation,
        eventId: "synthetic-no-intent-event",
        staffId: "synthetic-no-intent-staff",
        mutationCategory: "identity_creation",
        expectedRevision: nextHead.revision,
        expectedStaffState: "absent",
        resultingStaffState: "active"
      });

      assert.equal(legacy.status, "committed");

      const unclassified = await inspect(legacyOperation);
      assert.equal(unclassified.status, "unclassified");
      nonAuthorizing(unclassified);

      // No security receipt is not evidence of a completed append.
      const noReceipt = await inspect("synthetic-unknown-operation");
      assert.equal(noReceipt.status, "missing");
      nonAuthorizing(noReceipt);

      // Conflicting receipt expectation must fail closed.
      const receipt = await securityTable.getEntity<
        Record<string, unknown> & { etag: string }
      >(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        `operation-${operationId}`
      );

      await securityTable.updateEntity(
        {
          partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          rowKey: `operation-${operationId}`,
          appendIntentRequirement: "not_required"
        },
        "Merge",
        { etag: receipt.etag }
      );

      const conflicting = await inspect();
      assert.equal(conflicting.status, "contradictory");
      nonAuthorizing(conflicting);

      console.log(
        "[PASS] Independent append-evidence Azurite regression."
      );
    } finally {
      await eventsTable.deleteTable();
    }
  } finally {
    await securityTable.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});