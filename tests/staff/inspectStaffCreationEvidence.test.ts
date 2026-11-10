import assert from "node:assert/strict";
import type { StaffEvent } from
  "../../src/domain/staff/projectStaffDirectory";
import {
  inspectStaffCreationEvidence,
  type StaffCreationEvidenceReadPort,
  type StaffCreationEvidence
} from "../../src/repositories/inspectStaffCreationEvidence";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";

const event: StaffEvent = {
  eventId: "evt-create-103",
  staffId: "staff-create-103",
  actorId: "staff-admin",
  type: "staff.created",
  occurredAt: "2026-11-09T12:00:00.000Z",
  data: {
    displayName: "Synthetic Staff",
    status: "active",
    entraTenantId: "11111111-1111-4111-8111-111111111111",
    entraObjectId: "22222222-2222-4222-8222-222222222222"
  }
};

const eventRow = `${event.occurredAt}__${event.eventId}`;
const receiptRow =
  `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${event.eventId}`;

function rows() {
  return new Map<string, Record<string, unknown>>([
    [STAFF_SECURITY_METADATA_HEAD, {
      partitionKey: event.staffId,
      rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 0,
      state: "active"
    }],
    [eventRow, {
      partitionKey: event.staffId,
      rowKey: eventRow,
      eventId: event.eventId,
      staffId: event.staffId,
      actorId: event.actorId,
      type: event.type,
      occurredAt: event.occurredAt,
      dataJson: JSON.stringify(event.data)
    }],
    [receiptRow, {
      partitionKey: event.staffId,
      rowKey: receiptRow,
      eventId: event.eventId,
      staffId: event.staffId,
      kind: "staff.creation.prototype",
      revision: 0
    }]
  ]);
}

function mock(
  entities: Map<string, Record<string, unknown>>,
  calls: string[]
): StaffCreationEvidenceReadPort {
  return {
    getEntity: async (partition, key) => {
      assert.equal(partition, event.staffId);
      calls.push(key);
      const entity = entities.get(key);
      if (!entity) throw { statusCode: 404 };
      return entity;
    }
  };
}

function noAuthority(result: StaffCreationEvidence) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionWriterFenced, false);
  assert.equal(result.authoritative, false);
}

async function main(): Promise<void> {
  {
    const calls: string[] = [];
    const result = await inspectStaffCreationEvidence(
      event, mock(rows(), calls)
    );
    assert.equal(result.status, "inconsistent");
    assert.equal(calls.length, 0);
    noAuthority(result);
    console.log("[PASS] Default-disabled makes zero storage reads");
  }

  {
    const calls: string[] = [];
    const result = await inspectStaffCreationEvidence(
      event, mock(rows(), calls), true
    );
    assert.equal(result.status, "observed_creation");
    assert.deepEqual(calls, [
      STAFF_SECURITY_METADATA_HEAD,
      eventRow,
      receiptRow
    ]);
    noAuthority(result);
    console.log("[PASS] Matching head, event, and receipt observed");
  }

  {
    const entities = rows();
    entities.delete(receiptRow);
    const result = await inspectStaffCreationEvidence(
      event, mock(entities, []), true
    );
    assert.equal(result.status, "absent_or_unavailable");
    noAuthority(result);
    console.log("[PASS] Missing receipt cannot prove creation");
  }

  {
    const entities = rows();
    const bad = entities.get(eventRow)!;
    entities.set(eventRow, {
      ...bad,
      dataJson: JSON.stringify({ displayName: "Wrong" })
    });
    const result = await inspectStaffCreationEvidence(
      event, mock(entities, []), true
    );
    assert.equal(result.status, "inconsistent");
    noAuthority(result);
    console.log("[PASS] Conflicting canonical data rejected");
  }

  {
    const entities = rows();
    entities.set(receiptRow, {
      ...entities.get(receiptRow)!,
      kind: "unrecognized"
    });
    const result = await inspectStaffCreationEvidence(
      event, mock(entities, []), true
    );
    assert.equal(result.status, "inconsistent");
    console.log("[PASS] Invalid creation receipt rejected");
  }

  {
    const entities = rows();
    entities.set(STAFF_SECURITY_METADATA_HEAD, {
      ...entities.get(STAFF_SECURITY_METADATA_HEAD)!,
      revision: 3,
      state: "revoked"
    });
    const result = await inspectStaffCreationEvidence(
      event, mock(entities, []), true
    );
    assert.equal(result.status, "observed_creation");
    noAuthority(result);
    console.log("[PASS] Historical creation is not current authorization");
  }

  {
    const result = await inspectStaffCreationEvidence(
      event,
      {
        getEntity: async () => {
          throw new Error("storage unavailable");
        }
      },
      true
    );
    assert.equal(result.status, "absent_or_unavailable");
    noAuthority(result);
    console.log("[PASS] Storage uncertainty remains non-authorizing");
  }

  {
    let calls = 0;
    const result = await inspectStaffCreationEvidence(
      { ...event, type: "staff.updated" },
      {
        getEntity: async () => {
          calls++;
          return {};
        }
      },
      true
    );
    assert.equal(result.status, "inconsistent");
    assert.equal(calls, 0);
    console.log("[PASS] Invalid input rejected before storage");
  }

  console.log("[PASS] Canonical creation evidence regressions");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});