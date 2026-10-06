import assert from "node:assert/strict";
import type {
  TableClient
} from "@azure/data-tables";
import type {
  PersistedMinistryEmailProviderEvidenceV1
} from "../../src/contracts/ministryEmailProviderEvidencePersistence.v1";
import {
  AzureMinistryEmailProviderEvidenceRepository,
  ministryEmailProviderEvidenceRowKey
} from "../../src/repositories/ministryEmailProviderEvidenceRepository";

const partition =
  "EMAIL_DELIVERIES";

type Row = {
  partitionKey: string;
  rowKey: string;
  evidenceJson: string;
};

class FakeTable {
  rows = new Map<string, Row>();

  key(
    partitionKey: string,
    rowKey: string
  ): string {
    return `${partitionKey}::${rowKey}`;
  }

  async getEntity<T>(
    partitionKey: string,
    rowKey: string
  ): Promise<T> {
    const row = this.rows.get(
      this.key(
        partitionKey,
        rowKey
      )
    );

    if (!row) {
      throw {
        statusCode: 404,
        code: "ResourceNotFound"
      };
    }

    return structuredClone(row) as T;
  }

  async createEntity<T extends Row>(
    entity: T
  ): Promise<void> {
    const key = this.key(
      entity.partitionKey,
      entity.rowKey
    );

    if (this.rows.has(key)) {
      throw {
        statusCode: 409,
        code: "EntityAlreadyExists"
      };
    }

    this.rows.set(
      key,
      structuredClone(entity)
    );
  }
}

const record:
PersistedMinistryEmailProviderEvidenceV1 = {
  schemaVersion: 1,
  provider: "sendgrid",
  evidenceId: "event-1",
  deliveryId: "delivery-1",
  dispatchAttemptId: "attempt-1",
  kind: "provider_accepted",
  source: "verified_provider_event",
  observedAt: "2026-10-05T17:00:00.000Z",
  providerMessageId: "message-1",
  eventType: "processed",
  evidenceFingerprint:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
};

async function run(): Promise<void> {
  const table = new FakeTable();

  const repository =
    new AzureMinistryEmailProviderEvidenceRepository(
      async () =>
        table as unknown as TableClient
    );

  assert.equal(
    await repository.read(
      "sendgrid",
      record.evidenceId
    ),
    null
  );

  assert.equal(
    await repository.create(record),
    true
  );

  assert.deepEqual(
    await repository.read(
      "sendgrid",
      record.evidenceId
    ),
    record
  );

  assert.equal(
    await repository.create(record),
    false
  );

  const rowKey =
    ministryEmailProviderEvidenceRowKey(
      "sendgrid",
      record.evidenceId
    );

  assert.match(
    rowKey,
    /^PROVIDER_EVIDENCE:[a-f0-9]{64}$/
  );

  assert(
    !rowKey.includes(record.evidenceId),
    "raw evidenceId must not be copied into Azure row key"
  );

  assert.equal(
    table.rows.size,
    1
  );

  const resendRecord:
  PersistedMinistryEmailProviderEvidenceV1 = {
    ...record,
    provider: "resend",
    eventType: "email.delivered",
    evidenceFingerprint:
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  };

  const resendRowKey =
    ministryEmailProviderEvidenceRowKey(
      "resend",
      resendRecord.evidenceId
    );

  assert.notEqual(
    resendRowKey,
    rowKey
  );

  assert.equal(
    await repository.create(resendRecord),
    true
  );

  assert.deepEqual(
    await repository.read(
      "resend",
      resendRecord.evidenceId
    ),
    resendRecord
  );

  assert.equal(
    table.rows.size,
    2
  );

  console.log(
    "ministryEmailProviderEvidenceRepository.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});