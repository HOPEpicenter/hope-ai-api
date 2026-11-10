import assert from "node:assert/strict";
import type { TransactionAction } from "@azure/data-tables";
import {
  submitStaffScopedAtomicCreation
} from "../../src/repositories/staffScopedAtomicCreation";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";

const event = {
  eventId: "evt-creation-001",
  staffId: "staff-creation-001",
  actorId: "staff-admin",
  type: "staff.created" as const,
  occurredAt: "2026-11-09T12:00:00.000Z",
  data: {
    displayName: "Synthetic Staff",
    status: "active" as const,
    entraTenantId: "11111111-1111-4111-8111-111111111111",
    entraObjectId: "22222222-2222-4222-8222-222222222222"
  }
};

function nonAuthorizing(outcome: {
  executionPermitted: boolean;
  retryPermitted: boolean;
  productionWriterFenced: boolean;
}): void {
  assert.equal(outcome.executionPermitted, false);
  assert.equal(outcome.retryPermitted, false);
  assert.equal(outcome.productionWriterFenced, false);
}

async function main(): Promise<void> {
  {
    let calls = 0;
    const result = await submitStaffScopedAtomicCreation(
      event,
      {
        submitTransaction: async () => {
          calls++;
        }
      }
    );
    assert.equal(result.status, "denied");
    assert.equal(calls, 0);
    nonAuthorizing(result);
    console.log("[PASS] Default-disabled causes zero storage calls");
  }

  {
    let actions: TransactionAction[] = [];

    const outcome = await submitStaffScopedAtomicCreation(
      event,
      {
        submitTransaction: async input => {
          actions = input;
        }
      },
      true
    );

    assert.equal(outcome.status, "committed");
    nonAuthorizing(outcome);
    assert.equal(actions.length, 3);
    assert.deepEqual(actions.map(action => action[0]), [
      "create", "create", "create"
    ]);

    const entities = actions.map(
      action => action[1] as Record<string, unknown>
    );

    assert.ok(entities.every(
      entity => entity.partitionKey === event.staffId
    ));

    assert.equal(entities[0].rowKey, STAFF_SECURITY_METADATA_HEAD);
    assert.equal(entities[0].state, "active");
    assert.equal(entities[0].revision, 0);

    assert.equal(
      entities[1].rowKey,
      `${event.occurredAt}__${event.eventId}`
    );
    assert.equal(entities[1].type, "staff.created");
    assert.deepEqual(
      JSON.parse(String(entities[1].dataJson)),
      event.data
    );

    assert.equal(
      entities[2].rowKey,
      `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${event.eventId}`
    );
    assert.equal(entities[2].kind, "staff.creation.prototype");
    console.log("[PASS] Head, event and receipt share one transaction");
  }

  {
    let calls = 0;
    const outcome = await submitStaffScopedAtomicCreation(
      { ...event, type: "staff.updated" },
      { submitTransaction: async () => { calls++; } },
      true
    );
    assert.equal(outcome.status, "denied");
    assert.equal(calls, 0);
    console.log("[PASS] Non-creation events denied");
  }

  {
    let calls = 0;
    const outcome = await submitStaffScopedAtomicCreation(
      {
        ...event,
        data: { ...event.data, entraObjectId: null }
      },
      { submitTransaction: async () => { calls++; } },
      true
    );
    assert.equal(outcome.status, "denied");
    assert.equal(calls, 0);
    console.log("[PASS] Partial Entra binding denied");
  }

  {
    const outcome = await submitStaffScopedAtomicCreation(
      { ...event, data: { ...event.data, status: "inactive" } },
      { submitTransaction: async () => undefined },
      true
    );
    assert.equal(outcome.status, "denied");
    console.log("[PASS] Non-active creation denied");
  }

  {
    let calls = 0;
    const outcome = await submitStaffScopedAtomicCreation(
      event,
      {
        submitTransaction: async () => {
          calls++;
          throw { statusCode: 409 };
        }
      },
      true
    );
    assert.equal(outcome.status, "denied");
    assert.equal(calls, 1);
    nonAuthorizing(outcome);
    console.log("[PASS] Existing Staff head conflict denied");
  }

  {
    const outcome = await submitStaffScopedAtomicCreation(
      event,
      {
        submitTransaction: async () => {
          throw { statusCode: 412 };
        }
      },
      true
    );
    assert.equal(outcome.status, "denied");
    console.log("[PASS] Storage precondition conflict denied");
  }

  {
    const outcome = await submitStaffScopedAtomicCreation(
      event,
      {
        submitTransaction: async () => {
          throw new Error("simulated acknowledgement loss");
        }
      },
      true
    );
    assert.equal(outcome.status, "uncertain");
    nonAuthorizing(outcome);
    console.log("[PASS] Lost acknowledgement remains uncertain");
  }

  {
    let calls = 0;
    const outcome = await submitStaffScopedAtomicCreation(
      {
        ...event,
        data: {
          ...event.data,
          entraTenantId: "INVALID"
        }
      },
      { submitTransaction: async () => { calls++; } },
      true
    );
    assert.equal(outcome.status, "denied");
    assert.equal(calls, 0);
    console.log("[PASS] Malformed Entra identity rejected");
  }

  console.log("[PASS] Staff-scoped atomic creation regressions");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});