import assert from "node:assert/strict";

import {
  planTokenCustodyAtomicReceipt
} from "../../src/services/authorization/planTokenCustodyAtomicReceipt";

import {
  readTokenCustodyReceiptReconciliation,
  type CustodyReceiptReadPort
} from "../../src/repositories/readTokenCustodyReceiptReconciliation";

import {
  TOKEN_CUSTODY_PARTITION_KEY
} from "../../src/repositories/tokenCustodyMetadataRepository";

const input = {
  recordId: "synthetic-custody-1",
  etag: '"synthetic-etag"',
  receiptId: "123e4567-e89b-42d3-a456-426614174000",
  snapshot: {
    recordId: "synthetic-custody-1",
    revision: 3,
    rotationRevision: 2,
    revocationRevision: 0,
    state: "active" as const,
    accessExpiresAtMs: 1000
  },
  command: {
    action: "rotate" as const,
    expectedRevision: 3,
    expectedRotationRevision: 2,
    expectedRevocationRevision: 0,
    authorized: true,
    executionEnabled: true,
    nextAccessExpiresAtMs: 2000
  }
};

const plan = planTokenCustodyAtomicReceipt(input);
assert.equal(plan.outcome, "proposed");

if (plan.outcome !== "proposed") {
  throw new Error("Invalid synthetic fixture");
}

const [update, create] = plan.actions;

if (update.kind !== "update" || create.kind !== "create") {
  throw new Error("Unexpected action shapes");
}

const metadata = {
  partitionKey: TOKEN_CUSTODY_PARTITION_KEY,
  rowKey: update.rowKey,
  snapshotJson: update.snapshotJson,
  etag: '"metadata-etag"'
};

const receipt = {
  partitionKey: TOKEN_CUSTODY_PARTITION_KEY,
  rowKey: create.rowKey,
  receiptJson: create.receiptJson,
  etag: '"receipt-etag"'
};

let passed = 0;

async function test(
  name: string,
  setup: {
    metadata?: unknown;
    receipt?: unknown;
    metadataError?: unknown;
    receiptError?: unknown;
  },
  expectedStatus: string
): Promise<void> {
  let reads = 0;

  const port: CustodyReceiptReadPort = {
    async getEntity(partitionKey, rowKey) {
      reads++;

      assert.equal(
        partitionKey,
        TOKEN_CUSTODY_PARTITION_KEY
      );

      if (rowKey === update.rowKey) {
        if (setup.metadataError !== undefined) {
          throw setup.metadataError;
        }
        return setup.metadata ?? metadata;
      }

      if (rowKey === create.rowKey) {
        if (setup.receiptError !== undefined) {
          throw setup.receiptError;
        }
        return setup.receipt ?? receipt;
      }

      throw new Error("Unexpected row key");
    }
  };

  const result = await readTokenCustodyReceiptReconciliation(
    plan, port
  );

  assert.equal(result.status, expectedStatus);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.ok(reads >= 1 && reads <= 2);

  passed++;
  console.log(`PASS ${name}`);
}

async function run(): Promise<void> {
  await test(
    "matching storage observations recorded",
    {},
    "recorded"
  );

  await test(
    "missing receipt remains unproven",
    { receiptError: { statusCode: 404 } },
    "absent_unproven"
  );

  await test(
    "missing metadata remains unproven",
    { metadataError: { statusCode: 404 } },
    "absent_unproven"
  );

  await test(
    "SDK-style Error 404 remains unproven",
    {
      receiptError: Object.assign(
        new Error("synthetic storage not found"),
        { statusCode: 404 }
      )
    },
    "absent_unproven"
  );

  await test(
    "SDK-style Error 503 remains unresolved",
    {
      receiptError: Object.assign(
        new Error("synthetic storage unavailable"),
        { statusCode: 503 }
      )
    },
    "unresolved"
  );

  await test(
    "metadata timeout unresolved",
    { metadataError: new Error("synthetic timeout") },
    "unresolved"
  );

  await test(
    "receipt timeout unresolved",
    { receiptError: new Error("synthetic timeout") },
    "unresolved"
  );

  await test(
    "malformed receipt conflicts",
    { receipt: { ...receipt, receiptJson: "{invalid" } },
    "conflicting_evidence"
  );

  await test(
    "cross-partition metadata conflicts",
    { metadata: { ...metadata, partitionKey: "other" } },
    "conflicting_evidence"
  );

  let invalidReads = 0;
  const invalidPort: CustodyReceiptReadPort = {
    async getEntity() {
      invalidReads++;
      throw new Error("Must not read");
    }
  };

  const deniedPlan = planTokenCustodyAtomicReceipt({
    ...input,
    command: {
      ...input.command,
      executionEnabled: false
    }
  });

  const denied = await readTokenCustodyReceiptReconciliation(
    deniedPlan, invalidPort
  );

  assert.equal(denied.status, "unresolved");
  assert.equal(invalidReads, 0);
  assert.equal(denied.executionPermitted, false);
  assert.equal(denied.retryPermitted, false);
  passed++;
  console.log("PASS denied plan performs no reads");

  const unavailable = await readTokenCustodyReceiptReconciliation(
    plan,
    null as unknown as CustodyReceiptReadPort
  );

  assert.equal(unavailable.status, "unresolved");
  assert.equal(unavailable.executionPermitted, false);
  assert.equal(unavailable.retryPermitted, false);
  passed++;
  console.log("PASS missing reader fails closed");

  assert.equal(passed, 11);
  console.log("CUSTODY_RECEIPT_READER=11_OF_11_PASS");
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
