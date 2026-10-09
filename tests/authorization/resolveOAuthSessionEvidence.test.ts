import assert from "node:assert/strict";

import {
  resolveOAuthSessionEvidence,
  type OAuthSessionEvidenceReader,
  type OAuthSessionResolutionContext
} from "../../src/services/authorization/resolveOAuthSessionEvidence";

const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const bindingId = "33333333-3333-4333-8333-333333333333";

const otherId = "44444444-4444-4444-8444-444444444444";

const identity = {
  tenantId,
  objectId,
  staffId: "canonical-staff-test"
};

const context: OAuthSessionResolutionContext = {
  identity,
  sessionBindingId: bindingId,
  minimumRevision: 2
};

const record = {
  schemaVersion: 1,
  sessionBindingId: bindingId,
  tenantId,
  entraObjectId: objectId,
  canonicalStaffId: identity.staffId,
  status: "active",
  createdAt: "2026-01-01T12:00:00.000Z",
  expiresAt: "2026-01-01T13:00:00.000Z",
  revokedAt: null,
  revision: 2
};

const now = Date.parse("2026-01-01T12:30:00.000Z");

const denied = {
  allowed: false,
  reason: "session_evidence_denied"
};

function readRecords(
  records: readonly unknown[]
): OAuthSessionEvidenceReader {
  return async () => records;
}

async function expectDenied(
  reader: OAuthSessionEvidenceReader,
  input = context,
  clock = now
): Promise<void> {
  assert.deepEqual(
    await resolveOAuthSessionEvidence(reader, input, clock),
    denied
  );
}

async function main(): Promise<void> {
  let requestedBinding = "";

  const reader: OAuthSessionEvidenceReader = async id => {
    requestedBinding = id;
    return [record];
  };

  const result = await resolveOAuthSessionEvidence(
    reader, context, now
  );

  assert.equal(result.allowed, true);
  assert.equal(requestedBinding, bindingId);

  if (result.allowed) {
    assert.equal(result.evidence.revision, 2);
    assert.equal(result.evidence.canonicalStaffId, identity.staffId);
  }

  // Lower bounded revisions are allowed; stale ones are denied.
  await expectDenied(
    readRecords([{ ...record, revision: 1 }])
  );

  await expectDenied(readRecords([]));
  await expectDenied(readRecords([record, record]));
  await expectDenied(readRecords([null]));
  await expectDenied(readRecords([{}]));
  await expectDenied(readRecords([record, null]));

  await expectDenied(async () => {
    throw new Error("Synthetic repository unavailable");
  });

  for (const changed of [
    { ...record, sessionBindingId: otherId },
    { ...record, tenantId: otherId },
    { ...record, entraObjectId: otherId },
    { ...record, canonicalStaffId: "another-staff" },
    { ...record, status: "revoked",
      revokedAt: "2026-01-01T12:15:00.000Z" },
    { ...record, status: "expired" },
    { ...record, status: "pending" },
    { ...record, revision: -1 },
    { ...record, schemaVersion: 2 },
    { ...record, expiresAt: record.createdAt },
    { ...record, extra: true }
  ]) {
    await expectDenied(readRecords([changed]));
  }

  for (const changedContext of [
    { ...context, sessionBindingId: otherId },
    { ...context, identity: { ...identity, tenantId: otherId } },
    { ...context, identity: { ...identity, objectId: otherId } },
    { ...context, identity: { ...identity,
      staffId: "another-staff" } },
    { ...context, minimumRevision: -1 },
    { ...context, minimumRevision: 1.5 }
  ]) {
    await expectDenied(readRecords([record]), changedContext);
  }

  for (const clock of [
    Date.parse(record.createdAt) - 1,
    Date.parse(record.expiresAt),
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    0.5
  ]) {
    await expectDenied(readRecords([record]), context, clock);
  }

  let called = false;

  await expectDenied(async () => {
    called = true;
    return [record];
  }, {
    ...context,
    sessionBindingId: "invalid"
  });

  assert.equal(called, false);

  // This resolver intentionally does not claim that a prior
  // successful read protects against a later revocation.
  const mutable = {
    ...record,
    status: record.status as string,
    revokedAt: null as string | null
  };

  const mutableReader: OAuthSessionEvidenceReader =
    async () => [{ ...mutable }];

  const first = await resolveOAuthSessionEvidence(
    mutableReader, context, now
  );

  assert.equal(first.allowed, true);

  mutable.status = "revoked";
  mutable.revokedAt = "2026-01-01T12:31:00.000Z";
  mutable.revision = 3;

  const later = await resolveOAuthSessionEvidence(
    mutableReader,
    context,
    Date.parse("2026-01-01T12:32:00.000Z")
  );

  assert.deepEqual(later, denied);

  console.log(
    "resolveOAuthSessionEvidence synthetic security tests passed"
  );
}

main().catch(() => {
  console.error("Session evidence resolver tests failed");
  process.exitCode = 1;
});
