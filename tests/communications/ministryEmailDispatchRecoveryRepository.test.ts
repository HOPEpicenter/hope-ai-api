import assert from "node:assert/strict";
import type {
  TableClient
} from "@azure/data-tables";
import type {
  MinistryEmailDispatchRecoveryAuditV1
} from "../../src/contracts/ministryEmailDispatchRecovery.v1";
import type {
  MinistryEmailDeliveryRecord
} from "../../src/domain/communications/ministryEmailDeliveryContracts";
import {
  AzureMinistryEmailDispatchRecoveryRepository
} from "../../src/repositories/ministryEmailDispatchRecoveryRepository";

const partition = "EMAIL_DELIVERIES";

type Row = Record<string, any> & {
  partitionKey: string;
  rowKey: string;
  etag?: string;
};

class FakeTable {
  rows = new Map<string, Row>();
  transactionCount = 0;
  throwAfterCommit = false;

  key(partitionKey: string, rowKey: string) {
    return `${partitionKey}::${rowKey}`;
  }

  seed(row: Row) {
    this.rows.set(
      this.key(row.partitionKey, row.rowKey),
      structuredClone(row)
    );
  }

  async getEntity<T>(
    partitionKey: string,
    rowKey: string
  ): Promise<T> {
    const row = this.rows.get(this.key(partitionKey, rowKey));

    if (!row) {
      throw { statusCode: 404, code: "ResourceNotFound" };
    }

    return structuredClone(row) as T;
  }

  async submitTransaction(actions: any[]): Promise<void> {
    assert.equal(actions.length, 2);

    const update = actions[0];
    const create = actions[1];

    assert.equal(update[0], "update");
    assert.equal(update[2], "Replace");
    assert.equal(create[0], "create");
    assert.equal(update[1].partitionKey, partition);
    assert.equal(create[1].partitionKey, partition);

    const updateKey = this.key(
      update[1].partitionKey,
      update[1].rowKey
    );

    const createKey = this.key(
      create[1].partitionKey,
      create[1].rowKey
    );

    const current = this.rows.get(updateKey);

    if (!current) {
      throw { statusCode: 404 };
    }

    if (current.etag !== update[3].etag) {
      throw { statusCode: 412 };
    }

    if (this.rows.has(createKey)) {
      throw { statusCode: 409 };
    }

    const nextRows = new Map(this.rows);

    nextRows.set(updateKey, {
      ...structuredClone(update[1]),
      etag: `${current.etag}-next`
    });

    nextRows.set(createKey, structuredClone(create[1]));

    this.rows = nextRows;
    this.transactionCount += 1;

    if (this.throwAfterCommit) {
      throw new Error("lost transaction acknowledgement");
    }
  }
}

const delivery: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-recovery-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "dispatching",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "private",
  body: "private",
  recipientEmail: "private@example.org",
  eligibility: {
    phase5Enabled: true,
    contactConsent: true,
    emailPreference: "granted"
  },
  dispatchAttemptId: "attempt-1",
  dispatchClaimedAt: "2026-10-03T12:01:00.000Z",
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};

const accepted: MinistryEmailDeliveryRecord = {
  ...delivery,
  state: "provider_accepted",
  provider: "sendgrid",
  providerMessageId: "message-1",
  providerAcceptedAt: "2026-10-03T12:02:00.000Z"
};

const audit: MinistryEmailDispatchRecoveryAuditV1 = {
  schemaVersion: 1,
  resolutionId: "resolution-1",
  deliveryId: delivery.deliveryId,
  dispatchAttemptId: "attempt-1",
  actorId: "admin-1",
  resolvedAt: "2026-10-03T12:03:00.000Z",
  provider: "sendgrid",
  decision: "provider_accepted",
  evidenceKind: "provider_accepted",
  evidenceSource: "captured_send_response",
  evidenceId: "evidence-1",
  evidenceObservedAt: "2026-10-03T12:02:00.000Z",
  evidenceFingerprint: "fingerprint-1",
  providerMessageId: "message-1",
  failureCode: null
};

async function run(): Promise<void> {
  const table = new FakeTable();

  table.seed({
    partitionKey: partition,
    rowKey: delivery.deliveryId,
    deliveryJson: JSON.stringify(delivery),
    etag: "etag-1"
  });

  const repository =
    new AzureMinistryEmailDispatchRecoveryRepository(
      async () => table as unknown as TableClient
    );

  const initial = await repository.readDeliveryVersioned(
    delivery.deliveryId
  );

  assert(initial);
  assert.equal(initial.version, "etag-1");
  assert.deepEqual(initial.record, delivery);

  assert.equal(
    await repository.readRecovery(
      delivery.deliveryId,
      audit.resolutionId
    ),
    null
  );

  assert.equal(
    await repository.resolveIfVersion(
      accepted,
      audit,
      "etag-1"
    ),
    true
  );

  assert.equal(table.transactionCount, 1);

  const terminal = await repository.readDeliveryVersioned(
    delivery.deliveryId
  );

  assert(terminal);
  assert.deepEqual(terminal.record, accepted);

  assert.deepEqual(
    await repository.readRecovery(
      delivery.deliveryId,
      audit.resolutionId
    ),
    audit
  );

  assert.equal(
    await repository.resolveIfVersion(
      {
        ...accepted,
        providerMessageId: "different"
      },
      {
        ...audit,
        resolutionId: "resolution-2",
        providerMessageId: "different"
      },
      "etag-1"
    ),
    false,
    "stale ETag cannot create an audit record"
  );

  assert.equal(
    await repository.readRecovery(
      delivery.deliveryId,
      "resolution-2"
    ),
    null
  );

  assert.equal(table.transactionCount, 1);

  const collisionTable = new FakeTable();

  collisionTable.seed({
    partitionKey: partition,
    rowKey: delivery.deliveryId,
    deliveryJson: JSON.stringify(delivery),
    etag: "etag-collision"
  });

  collisionTable.seed({
    partitionKey: partition,
    rowKey: `RECOVERY:${delivery.deliveryId}:resolution-collision`,
    recoveryJson: JSON.stringify({
      ...audit,
      resolutionId: "resolution-collision"
    })
  });

  const collisionRepository =
    new AzureMinistryEmailDispatchRecoveryRepository(
      async () => collisionTable as unknown as TableClient
    );

  const collisionResult =
    await collisionRepository.resolveIfVersion(
      accepted,
      {
        ...audit,
        resolutionId: "resolution-collision"
      },
      "etag-collision"
    );

  assert.equal(
    collisionResult,
    false,
    "existing audit row must reject the entire atomic transaction"
  );

  const unchangedAfterAuditCollision =
    await collisionRepository.readDeliveryVersioned(
      delivery.deliveryId
    );

  assert(unchangedAfterAuditCollision);
  assert.deepEqual(
    unchangedAfterAuditCollision.record,
    delivery,
    "audit collision must not partially update delivery"
  );

  assert.equal(
    collisionTable.transactionCount,
    0,
    "audit collision must commit neither action"
  );

  console.log(
    "ministryEmailDispatchRecoveryRepository.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});