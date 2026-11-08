import assert from "node:assert/strict";

import {
  inspectCustodyAtomicBoundary,
  type CustodyAtomicBoundaryDependencies
} from "../../src/services/authorization/inspectCustodyAtomicBoundary";

import {
  TOKEN_CUSTODY_PARTITION_KEY
} from "../../src/repositories/tokenCustodyMetadataRepository";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CREDENTIAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const STAFF = "staff-test";

const CREATED = "2026-01-01T12:00:00.000Z";
const UPDATED = "2026-01-01T12:01:00.000Z";
const EXPIRES = "2026-01-01T12:15:00.000Z";
const NOW = Date.parse("2026-01-01T12:05:00.000Z");

const expected = {
  tenantId: TENANT,
  objectId: OBJECT,
  staffId: STAFF,
  sessionBindingId: SESSION,
  credentialId: CREDENTIAL,
  expectedSessionRevision: 4,
  expectedCredentialRevision: 7,
  custodyRecordId: CREDENTIAL,
  expectedCustodyRevision: 12,
  expectedRotationRevision: 3,
  expectedRevocationRevision: 0
};

const staff = {
  staffId: STAFF,
  entraTenantId: TENANT,
  entraObjectId: OBJECT,
  status: "active"
};

const session = {
  schemaVersion: 1,
  sessionBindingId: SESSION,
  tenantId: TENANT,
  entraObjectId: OBJECT,
  canonicalStaffId: STAFF,
  status: "active",
  createdAt: CREATED,
  expiresAt: EXPIRES,
  revokedAt: null,
  revision: 4
};

const credential = {
  schemaVersion: 1,
  credentialId: CREDENTIAL,
  owner: {
    tenantId: TENANT,
    entraObjectId: OBJECT,
    canonicalStaffId: STAFF,
    sessionBindingId: SESSION
  },
  status: "active",
  createdAt: CREATED,
  updatedAt: UPDATED,
  expiresAt: EXPIRES,
  revision: 7,
  encryptedCredential: {
    algorithm: "AES-256-GCM",
    keyReference: "synthetic-only",
    keyVersion: "v1",
    nonce: "synthetic",
    ciphertext: "synthetic",
    authenticationTag: "synthetic"
  }
};

const snapshot = {
  recordId: CREDENTIAL,
  revision: 12,
  rotationRevision: 3,
  revocationRevision: 0,
  state: "active",
  accessExpiresAtMs: Date.parse(EXPIRES)
};

function custodyRow(value: unknown = snapshot) {
  return {
    partitionKey: TOKEN_CUSTODY_PARTITION_KEY,
    rowKey: CREDENTIAL,
    snapshotJson: JSON.stringify(value),
    etag: 'W/"synthetic-etag"'
  };
}

type Overrides = {
  staff?: readonly unknown[];
  sessions?: readonly unknown[];
  credentials?: readonly unknown[];
  custody?: readonly unknown[];
  now?: number;
  clockSequence?: readonly number[];
  fail?: "staff" | "session" | "credential" |
    "custody" | "clock";
  calls?: { custody: number };
};

function deps(
  o: Overrides = {}
): CustodyAtomicBoundaryDependencies {
  let clockIndex = 0;
  return {
    async readStaffDirectory() {
      if (o.fail === "staff") throw Error("synthetic");
      return o.staff ?? [staff];
    },
    async readSessions() {
      if (o.fail === "session") throw Error("synthetic");
      return o.sessions ?? [session];
    },
    async readCredentials() {
      if (o.fail === "credential") throw Error("synthetic");
      return o.credentials ?? [credential];
    },
    async readCustodyRecords() {
      if (o.calls) o.calls.custody++;
      if (o.fail === "custody") throw Error("synthetic");
      return o.custody ?? [custodyRow()];
    },
    clock() {
      if (o.fail === "clock") throw Error("synthetic");
      if (o.clockSequence) {
        const value = o.clockSequence[clockIndex];
        clockIndex++;
        return value;
      }
      return o.now ?? NOW;
    }
  };
}

const denied = {
  preconditionsObserved: false,
  reason: "custody_boundary_denied",
  executionPermitted: false,
  retryPermitted: false
};

async function reject(
  label: string,
  input: unknown = expected,
  overrides: Overrides = {}
): Promise<void> {
  assert.deepEqual(
    await inspectCustodyAtomicBoundary(
      input, deps(overrides)
    ),
    denied,
    label
  );
  console.log(`PASS ${label}`);
}

async function main(): Promise<void> {
  assert.deepEqual(
    await inspectCustodyAtomicBoundary(expected, deps()),
    {
      preconditionsObserved: true,
      executionPermitted: false,
      retryPermitted: false
    }
  );
  console.log("PASS observes consistent evidence without execution");

  await reject("denies credential/custody ID mismatch", {
    ...expected, custodyRecordId: OTHER
  });

  await reject("denies credential revision mismatch",
    { ...expected, expectedCredentialRevision: 8 });

  await reject("denies session revision mismatch",
    { ...expected, expectedSessionRevision: 5 });

  await reject("denies custody revision mismatch",
    { ...expected, expectedCustodyRevision: 13 });

  await reject("denies rotation revision mismatch",
    { ...expected, expectedRotationRevision: 4 });

  await reject("denies revocation revision mismatch",
    { ...expected, expectedRevocationRevision: 1 });

  await reject("denies stale custody storage revision",
    expected, { custody: [
      custodyRow({ ...snapshot, revision: 13 })
    ] });

  await reject("denies revoked custody",
    expected, { custody: [
      custodyRow({ ...snapshot, state: "revoked" })
    ] });

  await reject("denies uncertain custody",
    expected, { custody: [
      custodyRow({ ...snapshot, state: "uncertain" })
    ] });

  await reject("denies expired custody",
    expected, { custody: [
      custodyRow({
        ...snapshot,
        accessExpiresAtMs: NOW
      })
    ] });

  await reject("denies duplicate custody records",
    expected, { custody: [custodyRow(), custodyRow()] });

  await reject("denies absent custody record",
    expected, { custody: [] });

  await reject("denies wildcard ETag",
    expected, { custody: [
      { ...custodyRow(), etag: "*" }
    ] });

  await reject("denies cross-partition custody row",
    expected, { custody: [
      { ...custodyRow(), partitionKey: "other" }
    ] });

  await reject("denies malformed snapshot JSON",
    expected, { custody: [
      { ...custodyRow(), snapshotJson: "{" }
    ] });

  await reject("denies injected credential field",
    expected, { custody: [
      custodyRow({ ...snapshot, refreshToken: "synthetic" })
    ] });

  await reject("denies additional expected fields",
    { ...expected, authorized: true });

  await reject("denies disabled staff",
    expected, { staff: [
      { ...staff, status: "inactive" }
    ] });

  await reject("denies duplicate staff binding",
    expected, { staff: [staff, staff] });

  await reject("denies revoked session",
    expected, { sessions: [
      { ...session, status: "revoked", revokedAt: UPDATED }
    ] });

  await reject("denies revoked credential",
    expected, { credentials: [
      { ...credential, status: "revoked" }
    ] });

  await reject("denies nonmonotonic clock",
    expected, { now: NOW - 1, custody: [
      custodyRow({
        ...snapshot,
        accessExpiresAtMs: NOW - 1
      })
    ] });

  await reject("denies clock reversal during readiness",
    expected, {
      clockSequence: [NOW, NOW - 1]
    });

  await reject("denies clock reversal after custody lookup",
    expected, {
      clockSequence: [NOW, NOW, NOW - 1]
    });

  await reject("denies invalid final clock",
    expected, {
      clockSequence: [NOW, NOW, Number.NaN]
    });

  assert.deepEqual(
    await inspectCustodyAtomicBoundary(expected, deps({
      clockSequence: [NOW, NOW + 1, NOW + 2]
    })),
    {
      preconditionsObserved: true,
      executionPermitted: false,
      retryPermitted: false
    }
  );
  console.log("PASS accepts monotonically increasing clock");
  for (const fail of [
    "staff", "session", "credential", "custody", "clock"
  ] as const) {
    await reject(`denies ${fail} dependency failure`,
      expected, { fail });
  }

  const calls = { custody: 0 };
  await reject("denies before custody lookup on failed identity",
    expected, {
      staff: [],
      calls
    }
  );
  assert.equal(calls.custody, 0);
  console.log("PASS no custody lookup after failed identity");

  console.log("CUSTODY_BOUNDARY_SYNTHETIC_TESTS=34_OF_34_PASS");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});