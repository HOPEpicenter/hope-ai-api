import assert from "node:assert/strict";
import {
  TOKEN_CUSTODY_PARTITION_KEY,
  TokenCustodyMetadataRepository,
  type TokenCustodyTableEntity,
  type TokenCustodyTablePort,
  type TokenCustodyWriteEntity,
} from "../../src/repositories/tokenCustodyMetadataRepository";

const recordId = "synthetic-custody-record";

const snapshot = {
  recordId,
  revision: 4,
  rotationRevision: 2,
  revocationRevision: 1,
  state: "active" as const,
  accessExpiresAtMs: 10000,
};

const rotate = {
  action: "rotate" as const,
  expectedRevision: 4,
  expectedRotationRevision: 2,
  expectedRevocationRevision: 1,
  authorized: true,
  executionEnabled: true,
  nextAccessExpiresAtMs: 20000,
};

function fakePort(
  options: {
    etag?: string;
    storedRecordId?: string;
    snapshotJson?: string;
    readError?: unknown;
    writeError?: unknown;
  } = {},
) {
  let writes = 0;
  let lastEtag: string | undefined;
  let lastMode: string | undefined;
  let lastWrite: TokenCustodyWriteEntity | undefined;

  const port: TokenCustodyTablePort = {
    async getEntity(): Promise<TokenCustodyTableEntity> {
      if (options.readError) {
        throw options.readError;
      }

      return {
        partitionKey: TOKEN_CUSTODY_PARTITION_KEY,
        rowKey: options.storedRecordId ?? recordId,
        snapshotJson:
          options.snapshotJson ?? JSON.stringify(snapshot),
        etag: options.etag ?? '"synthetic-etag-v1"',
      };
    },

    async updateEntity(entity, mode, writeOptions) {
      writes++;
      lastWrite = entity;
      lastMode = mode;
      lastEtag = writeOptions.etag;

      if (options.writeError) {
        throw options.writeError;
      }
    },
  };

  return {
    port,
    get writes() { return writes; },
    get lastEtag() { return lastEtag; },
    get lastMode() { return lastMode; },
    get lastWrite() { return lastWrite; },
  };
}

async function run() {
  const successful = fakePort();
  const committed = await new TokenCustodyMetadataRepository(
    successful.port,
  ).tryTransition(recordId, rotate);

  assert.equal(committed.outcome, "committed");
  assert.equal(committed.executionPermitted, false);
  assert.equal(successful.writes, 1);
  assert.equal(successful.lastMode, "Replace");
  assert.equal(successful.lastEtag, '"synthetic-etag-v1"');
  assert.equal(
    successful.lastWrite?.partitionKey,
    TOKEN_CUSTODY_PARTITION_KEY,
  );
  assert.equal(
    JSON.parse(successful.lastWrite!.snapshotJson).revision,
    5,
  );
  console.log("PASS exact ETag conditional replacement");

  const disabled = fakePort();
  const disabledResult = await new TokenCustodyMetadataRepository(
    disabled.port,
  ).tryTransition(
    recordId,
    { ...rotate, executionEnabled: false },
  );
  assert.equal(disabledResult.outcome, "denied");
  assert.equal(disabled.writes, 0);
  console.log("PASS execution disabled blocks writes");

  const unauthorized = fakePort();
  const unauthorizedResult = await new TokenCustodyMetadataRepository(
    unauthorized.port,
  ).tryTransition(
    recordId,
    { ...rotate, authorized: false },
  );
  assert.equal(unauthorizedResult.outcome, "denied");
  assert.equal(unauthorized.writes, 0);
  console.log("PASS unauthorized command blocks writes");

  const stale = fakePort();
  const staleResult = await new TokenCustodyMetadataRepository(
    stale.port,
  ).tryTransition(
    recordId,
    { ...rotate, expectedRevision: 3 },
  );
  assert.equal(staleResult.outcome, "denied");
  assert.equal(stale.writes, 0);
  console.log("PASS stale revision blocks writes");

  const conflict = fakePort({
    writeError: { statusCode: 412 },
  });
  const conflictResult = await new TokenCustodyMetadataRepository(
    conflict.port,
  ).tryTransition(recordId, rotate);

  assert.equal(conflictResult.outcome, "denied");
  assert.equal(
    "retryPermitted" in conflictResult &&
      conflictResult.retryPermitted,
    false,
  );
  console.log("PASS ETag conflict denies retry");

  const unknown = fakePort({
    writeError: new Error("synthetic lost acknowledgement"),
  });
  const uncertainResult = await new TokenCustodyMetadataRepository(
    unknown.port,
  ).tryTransition(recordId, rotate);

  assert.equal(uncertainResult.outcome, "uncertain");
  assert.equal(
    "retryPermitted" in uncertainResult &&
      uncertainResult.retryPermitted,
    false,
  );
  assert.equal(unknown.writes, 1);
  console.log("PASS lost acknowledgement remains uncertain");

  const wildcard = fakePort({ etag: "*" });
  const wildcardResult = await new TokenCustodyMetadataRepository(
    wildcard.port,
  ).tryTransition(recordId, rotate);
  assert.equal(wildcardResult.outcome, "denied");
  assert.equal(wildcard.writes, 0);
  console.log("PASS wildcard ETag rejected");

  const mismatch = fakePort({
    storedRecordId: "another-record",
  });
  const mismatchResult = await new TokenCustodyMetadataRepository(
    mismatch.port,
  ).tryTransition(recordId, rotate);
  assert.equal(mismatchResult.outcome, "denied");
  assert.equal(mismatch.writes, 0);
  console.log("PASS record identity mismatch rejected");

  const malformed = fakePort({ snapshotJson: "{invalid" });
  const malformedResult = await new TokenCustodyMetadataRepository(
    malformed.port,
  ).tryTransition(recordId, rotate);
  assert.equal(malformedResult.outcome, "denied");
  assert.equal(malformed.writes, 0);
  console.log("PASS malformed snapshot rejected");

  const revoked = fakePort({
    snapshotJson: JSON.stringify({
      ...snapshot,
      state: "revoked",
    }),
  });
  const revokedResult = await new TokenCustodyMetadataRepository(
    revoked.port,
  ).tryTransition(recordId, rotate);
  assert.equal(revokedResult.outcome, "denied");
  assert.equal(revoked.writes, 0);
  console.log("PASS revoked custody cannot rotate");

  const unexpectedField = fakePort({
    snapshotJson: JSON.stringify({
      ...snapshot,
      refreshToken: "synthetic-value-never-persist",
    }),
  });
  const unexpectedFieldResult = await new TokenCustodyMetadataRepository(
    unexpectedField.port,
  ).tryTransition(recordId, rotate);
  assert.equal(unexpectedFieldResult.outcome, "denied");
  assert.equal(unexpectedField.writes, 0);
  console.log("PASS unexpected credential field never written");

  const readFailure = fakePort({
    readError: new Error("synthetic storage timeout"),
  });
  const readFailureResult = await new TokenCustodyMetadataRepository(
    readFailure.port,
  ).tryTransition(recordId, rotate);
  assert.equal(readFailureResult.outcome, "uncertain");
  assert.equal(readFailure.writes, 0);
  console.log("PASS unknown read failure is uncertain");

  const missing = fakePort({
    readError: { statusCode: 404 },
  });
  const missingResult = await new TokenCustodyMetadataRepository(
    missing.port,
  ).tryTransition(recordId, rotate);
  assert.equal(missingResult.outcome, "denied");
  assert.equal(missing.writes, 0);
  console.log("PASS missing record is denied");
}

run().catch((error) => {
  console.error("SYNTHETIC_CUSTODY_TEST_FAILED", error);
  process.exitCode = 1;
});