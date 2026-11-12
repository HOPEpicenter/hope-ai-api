import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import {
  EntraStaffAcceptanceHandoffReceiptStorageRepository,
  ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY,
  type EntraStaffAcceptanceReceiptTableEntity,
  type EntraStaffAcceptanceReceiptTablePort
} from "../../src/repositories/entraStaffAcceptanceHandoffReceiptStorageRepository";
import {
  createEntraStaffAcceptanceHandoff,
  ENTRA_STAFF_ACCEPTANCE_OPERATION,
  type TrustedEntraStaffAcceptanceEvidence
} from "../../src/services/authorization/entraStaffAcceptanceHandoff";

if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true" ||
    process.env.HOPE_OAUTH_AZURITE_TABLE_PORT !== "11002") {
  throw new Error("Isolated local Azurite Table configuration required");
}

const connectionString = [
  "DefaultEndpointsProtocol=http",
  "AccountName=devstoreaccount1",
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
].join(";");

const tableName =
  "EntraStaffHandoffIT" + randomBytes(8).toString("hex");
const table = TableClient.fromConnectionString(
  connectionString,
  tableName,
  { allowInsecureConnection: true }
);

const staffId = randomUUID();
const tenantId = randomUUID();
const objectId = randomUUID();
const INITIAL_TIME = 2_000_000_000_000;
let currentTime = INITIAL_TIME;

function evidence(
  overrides: Partial<TrustedEntraStaffAcceptanceEvidence> = {}
): TrustedEntraStaffAcceptanceEvidence {
  return {
    verifiedIdentity: { staffId, tenantId, objectId },
    canonicalStaff: {
      staffId,
      status: "active",
      entraTenantId: tenantId,
      entraObjectId: objectId
    },
    administratorAuthorized: true,
    verifiedAt: currentTime,
    ...overrides
  };
}

function boundary(
  resolve: () => TrustedEntraStaffAcceptanceEvidence | null =
    () => evidence()
) {
  return {
    resolveAuthorizedEvidence: async () => resolve()
  };
}

function repository() {
  return new EntraStaffAcceptanceHandoffReceiptStorageRepository(
    port,
    () => currentTime
  );
}

function handoff(
  receiptRepository: EntraStaffAcceptanceHandoffReceiptStorageRepository,
  authorizedBoundary = boundary()
) {
  return createEntraStaffAcceptanceHandoff(
    { enabled: true },
    {
      boundary: authorizedBoundary,
      repository: receiptRepository,
      now: () => currentTime,
      createReceiptId: () => randomBytes(32).toString("hex")
    }
  );
}

const port: EntraStaffAcceptanceReceiptTablePort = {
  async createEntity(entity) {
    await table.createEntity(entity);
  },
  async getEntity(partitionKey, rowKey) {
    const entity =
      await table.getEntity<EntraStaffAcceptanceReceiptTableEntity>(
        partitionKey,
        rowKey
      );
    if (typeof entity.etag !== "string") {
      throw new Error("Azurite did not return an ETag");
    }
    return {
      ...entity,
      etag: entity.etag
    };
  },
  async updateEntity(entity, mode, options) {
    await table.updateEntity(entity, mode, options);
  }
};

async function main(): Promise<void> {
  await table.createTable();

  try {
    const issuer = handoff(repository());
    const issued = await issuer.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION);
    assert.equal(issued.status, "issued");
    if (issued.status !== "issued") {
      throw new Error("Synthetic authorized evidence was not accepted");
    }

    const receiptId = issued.receipt.receiptId;
    assert.match(receiptId, /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(issued.receipt), ["receiptId"]);
    assert.equal(JSON.stringify(issued.receipt).includes(staffId), false);
    assert.equal(JSON.stringify(issued.receipt).includes(tenantId), false);
    assert.equal(JSON.stringify(issued.receipt).includes(objectId), false);

    const beforeRace = await table.getEntity<
      EntraStaffAcceptanceReceiptTableEntity
    >(ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY, receiptId);
    assert.equal(beforeRace.state, "issued");
    assert.equal(beforeRace.revision, 0);
    assert.equal(beforeRace.operation, ENTRA_STAFF_ACCEPTANCE_OPERATION);
    assert.equal(typeof beforeRace.identityDigest, "string");
    assert.notEqual(beforeRace.identityDigest, staffId);
    assert.notEqual(beforeRace.identityDigest, tenantId);
    assert.notEqual(beforeRace.identityDigest, objectId);
    assert.equal(JSON.stringify(beforeRace).includes(staffId), false);
    assert.equal(JSON.stringify(beforeRace).includes(tenantId), false);
    assert.equal(JSON.stringify(beforeRace).includes(objectId), false);

    const consumers = Array.from({ length: 24 }, () => handoff(repository()));
    const outcomes = await Promise.all(
      consumers.map(consumer =>
        consumer.consume(
          issued.receipt,
          ENTRA_STAFF_ACCEPTANCE_OPERATION
        )
      )
    );
    assert.equal(
      outcomes.filter(result => result.status === "authorized").length,
      1
    );
    assert.equal(
      outcomes.filter(result => result.status === "denied").length,
      23
    );

    const consumed = await table.getEntity<
      EntraStaffAcceptanceReceiptTableEntity
    >(ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY, receiptId);
    assert.equal(consumed.state, "consumed");
    assert.equal(consumed.revision, 1);
    assert.equal(typeof consumed.consumedAtMs, "number");

    assert.deepEqual(
      await handoff(repository()).consume(
        issued.receipt,
        ENTRA_STAFF_ACCEPTANCE_OPERATION
      ),
      { status: "denied" }
    );
    console.log("PASS durable consume across repository instances");

    const expiringDuringWrite = await handoff(repository()).issue(
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    );
    assert.equal(expiringDuringWrite.status, "issued");
    if (expiringDuringWrite.status !== "issued") {
      throw new Error("Synthetic authorized evidence was not accepted");
    }
    const expiringPort: EntraStaffAcceptanceReceiptTablePort = {
      ...port,
      async updateEntity(entity, mode, options) {
        await table.updateEntity(entity, mode, options);
        currentTime += 60 * 1000;
      }
    };
    assert.deepEqual(
      await handoff(
        new EntraStaffAcceptanceHandoffReceiptStorageRepository(
          expiringPort,
          () => currentTime
        )
      ).consume(
        expiringDuringWrite.receipt,
        ENTRA_STAFF_ACCEPTANCE_OPERATION
      ),
      { status: "denied" }
    );
    currentTime = INITIAL_TIME;
    const expiredAfterWrite = await table.getEntity<
      EntraStaffAcceptanceReceiptTableEntity
    >(
      ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY,
      expiringDuringWrite.receipt.receiptId
    );
    assert.equal(expiredAfterWrite.state, "consumed");
    assert.deepEqual(
      await handoff(repository()).consume(
        expiringDuringWrite.receipt,
        ENTRA_STAFF_ACCEPTANCE_OPERATION
      ),
      { status: "denied" }
    );
    console.log("PASS expiry during conditional write denied");

    const uncertainIssue = await handoff(repository()).issue(
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    );
    assert.equal(uncertainIssue.status, "issued");
    if (uncertainIssue.status !== "issued") {
      throw new Error("Synthetic authorized evidence was not accepted");
    }
    const uncertainPort: EntraStaffAcceptanceReceiptTablePort = {
      ...port,
      async updateEntity(entity, mode, options) {
        await table.updateEntity(entity, mode, options);
        throw new Error("Synthetic lost acknowledgment");
      }
    };
    const uncertainResult = await handoff(
      new EntraStaffAcceptanceHandoffReceiptStorageRepository(
        uncertainPort,
        () => currentTime
      )
    ).consume(
      uncertainIssue.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    );
    assert.deepEqual(uncertainResult, { status: "storage_unavailable" });
    const uncertainStored = await table.getEntity<
      EntraStaffAcceptanceReceiptTableEntity
    >(
      ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY,
      uncertainIssue.receipt.receiptId
    );
    assert.equal(uncertainStored.state, "consumed");
    assert.deepEqual(
      await handoff(repository()).consume(
        uncertainIssue.receipt,
        ENTRA_STAFF_ACCEPTANCE_OPERATION
      ),
      { status: "denied" }
    );
    console.log("PASS ambiguous commit denied without retry");

    const staleRevisionIssue = await handoff(repository()).issue(
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    );
    assert.equal(staleRevisionIssue.status, "issued");
    if (staleRevisionIssue.status !== "issued") {
      throw new Error("Synthetic authorized evidence was not accepted");
    }
    const staleId = staleRevisionIssue.receipt.receiptId;
    const staleEntity = await table.getEntity<
      EntraStaffAcceptanceReceiptTableEntity
    >(ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY, staleId);
    await table.updateEntity(
      {
        partitionKey: staleEntity.partitionKey,
        rowKey: staleEntity.rowKey,
        schemaVersion: staleEntity.schemaVersion,
        operation: staleEntity.operation,
        identityDigest: staleEntity.identityDigest,
        issuedAtMs: staleEntity.issuedAtMs,
        expiresAtMs: staleEntity.expiresAtMs,
        state: "issued",
        revision: 4
      },
      "Replace",
      { etag: staleEntity.etag }
    );
    assert.deepEqual(
      await handoff(repository()).consume(
        staleRevisionIssue.receipt,
        ENTRA_STAFF_ACCEPTANCE_OPERATION
      ),
      { status: "denied" }
    );
    console.log("PASS stale durable revision rejected");

    const expiredIssue = await handoff(repository()).issue(
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    );
    assert.equal(expiredIssue.status, "issued");
    if (expiredIssue.status !== "issued") {
      throw new Error("Synthetic authorized evidence was not accepted");
    }
    currentTime += 60 * 1000;
    assert.deepEqual(
      await handoff(repository()).consume(
        expiredIssue.receipt,
        ENTRA_STAFF_ACCEPTANCE_OPERATION
      ),
      { status: "denied" }
    );
    currentTime = INITIAL_TIME;
    console.log("PASS expired durable receipt rejected");

    const revokedIssue = await handoff(repository()).issue(
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    );
    assert.equal(revokedIssue.status, "issued");
    if (revokedIssue.status !== "issued") {
      throw new Error("Synthetic authorized evidence was not accepted");
    }
    const revoked = await handoff(
      repository(),
      boundary(() =>
        evidence({
          canonicalStaff: {
            staffId,
            status: "inactive",
            entraTenantId: tenantId,
            entraObjectId: objectId
          }
        })
      )
    ).consume(revokedIssue.receipt, ENTRA_STAFF_ACCEPTANCE_OPERATION);
    assert.deepEqual(revoked, { status: "denied" });
    console.log("PASS revoked canonical Staff rejected");

    const mismatchedIssue = await handoff(repository()).issue(
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    );
    assert.equal(mismatchedIssue.status, "issued");
    if (mismatchedIssue.status !== "issued") {
      throw new Error("Synthetic authorized evidence was not accepted");
    }
    const differentTenantId = randomUUID();
    assert.deepEqual(
      await handoff(
        repository(),
        boundary(() =>
          evidence({
            verifiedIdentity: {
              staffId,
              tenantId: differentTenantId,
              objectId
            },
            canonicalStaff: {
              staffId,
              status: "active",
              entraTenantId: differentTenantId,
              entraObjectId: objectId
            }
          })
        )
      ).consume(
        mismatchedIssue.receipt,
        ENTRA_STAFF_ACCEPTANCE_OPERATION
      ),
      { status: "denied" }
    );
    console.log("PASS mismatched identity rejected");

    const wrongOperationIssue = await handoff(repository()).issue(
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    );
    assert.equal(wrongOperationIssue.status, "issued");
    if (wrongOperationIssue.status !== "issued") {
      throw new Error("Synthetic authorized evidence was not accepted");
    }
    assert.deepEqual(
      await handoff(repository()).consume(
        wrongOperationIssue.receipt,
        "another-operation"
      ),
      { status: "operation_mismatch" }
    );

    const staleEvidenceResult = await handoff(
      repository(),
      boundary(() =>
        evidence({ verifiedAt: currentTime - 5 * 60 * 1000 - 1 })
      )
    ).issue(ENTRA_STAFF_ACCEPTANCE_OPERATION);
    assert.deepEqual(staleEvidenceResult, { status: "expired" });

    console.log("ENTRA_STAFF_ACCEPTANCE_AZURITE_TESTS_PASSED=True");
  } finally {
    await table.deleteTable();
  }
}

main().catch(() => {
  console.error("Entra staff acceptance Azurite test failed");
  process.exitCode = 1;
});
