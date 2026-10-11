import assert from "node:assert/strict";

import {
  inspectOAuthExecutionBoundaryReadiness,
  type OAuthExecutionReadinessDependencies
} from "../../src/services/authorization/inspectOAuthExecutionBoundaryReadiness";

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
  expectedCredentialRevision: 7
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

const denied = {
  readyForAtomicFence: false,
  reason: "execution_preconditions_denied"
};

interface Overrides {
  staff?: readonly unknown[];
  sessions?: readonly unknown[];
  credentials?: readonly unknown[];
  now?: number;
  finalNow?: number;
  throwAt?: "staff" | "session" | "credential" | "clock";
}

function deps(
  overrides: Overrides = {}
): OAuthExecutionReadinessDependencies {
  let clockCalls = 0;
  return {
    async readStaffDirectory() {
      if (overrides.throwAt === "staff") throw Error("staff");
      return overrides.staff ?? [staff];
    },
    async readSessions() {
      if (overrides.throwAt === "session") throw Error("session");
      return overrides.sessions ?? [session];
    },
    async readCredentials() {
      if (overrides.throwAt === "credential") throw Error("credential");
      return overrides.credentials ?? [credential];
    },
    clock() {
      if (overrides.throwAt === "clock") throw Error("clock");
      clockCalls++;
      return clockCalls === 1
        ? (overrides.now ?? NOW)
        : (overrides.finalNow ?? NOW);
    }
  };
}

async function reject(
  overrides: Overrides = {},
  evidence: unknown = expected
): Promise<void> {
  assert.deepEqual(
    await inspectOAuthExecutionBoundaryReadiness(
      evidence, deps(overrides)
    ),
    denied
  );
}

async function main(): Promise<void> {
  assert.deepEqual(
    await inspectOAuthExecutionBoundaryReadiness(
      expected, deps()
    ),
    { readyForAtomicFence: true }
  );

  await reject({ staff: [] });
  await reject({ staff: [staff, staff] });
  await reject({ staff: [
    staff,
    { ...staff, staffId: "duplicate-binding" }
  ] });
  await reject({ staff: [{ ...staff, entraTenantId: OTHER }] });
  await reject({ staff: [{ ...staff, entraObjectId: OTHER }] });
  await reject({ sessions: [{
    ...session, canonicalStaffId: "other-staff"
  }] });
  await reject({ sessions: [{
    ...session, tenantId: OTHER
  }] });
  await reject({ sessions: [{
    ...session, expiresAt: UPDATED
  }] });
  await reject({ credentials: [{
    ...credential,
    owner: { ...credential.owner, canonicalStaffId: "other-staff" }
  }] });
  await reject({ credentials: [{
    ...credential,
    owner: { ...credential.owner, tenantId: OTHER }
  }] });
  await reject({ credentials: [{
    ...credential, expiresAt: UPDATED
  }] });
  await reject({}, {
    ...expected,
    expectedCredentialRevision: Number.MAX_SAFE_INTEGER + 1
  });
  await reject({}, {
    ...expected,
    expectedSessionRevision: -1
  });
  await reject({ staff: [{ ...staff, status: "inactive" }] });
  await reject({ staff: [{ ...staff, staffId: "other-staff" }] });
  await reject({ sessions: [] });
  await reject({ sessions: [session, session] });
  await reject({ sessions: [{ ...session, revision: 5 }] });
  await reject({ sessions: [{
    ...session, status: "revoked", revokedAt: UPDATED
  }] });
  await reject({ sessions: [{ ...session, sessionBindingId: OTHER }] });
  await reject({ credentials: [] });
  await reject({ credentials: [credential, credential] });
  await reject({ credentials: [{ ...credential, revision: 8 }] });
  await reject({ credentials: [{ ...credential, status: "revoked" }] });
  await reject({ credentials: [{
    ...credential,
    owner: { ...credential.owner, sessionBindingId: OTHER }
  }] });
  await reject({ now: Number.NaN });
  await reject({ finalNow: NOW - 1 });
  await reject({ finalNow: Date.parse(EXPIRES) });

  for (const throwAt of [
    "staff", "session", "credential", "clock"
  ] as const) {
    await reject({ throwAt });
  }

  await reject({}, {
    ...expected,
    expectedCredentialRevision: -1
  });
  await reject({}, {
    ...expected,
    expectedSessionRevision: Number.NaN
  });
  await reject({}, { ...expected, credentialId: OTHER });
  await reject({}, { ...expected, extra: "untrusted" });
  await reject({}, { authorized: true });

  console.log(
    "OAuth execution readiness synthetic security tests passed"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
