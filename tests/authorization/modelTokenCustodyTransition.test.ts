import assert from "node:assert/strict";
import { modelTokenCustodyTransition } from "../../src/services/authorization/modelTokenCustodyTransition";

const snapshot = {
  recordId: "synthetic-custody-record",
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

function check(
  name: string,
  passed: boolean,
): void {
  assert.equal(passed, true, name);
  console.log(`PASS ${name}`);
}

const current = modelTokenCustodyTransition(
  snapshot,
  rotate,
);

check(
  "synthetic rotation proposal increments revisions",
  current.outcome === "proposed" &&
    current.next.revision === 5 &&
    current.next.rotationRevision === 3 &&
    current.executionPermitted === false,
);

const disabled = modelTokenCustodyTransition(
  snapshot,
  { ...rotate, executionEnabled: false },
);

check(
  "default-disabled execution rejects rotation",
  disabled.outcome === "denied" &&
    disabled.reason === "execution_disabled",
);

const stale = modelTokenCustodyTransition(
  snapshot,
  { ...rotate, expectedRevision: 3 },
);

check(
  "stale revision rejected",
  stale.outcome === "denied" &&
    stale.reason === "stale_revision",
);

const revoked = modelTokenCustodyTransition(
  snapshot,
  { ...rotate, action: "revoke" },
);

check(
  "revocation proposal changes custody state",
  revoked.outcome === "proposed" &&
    revoked.next.state === "revoked" &&
    revoked.next.revocationRevision === 2 &&
    revoked.executionPermitted === false,
);

const inactive = modelTokenCustodyTransition(
  { ...snapshot, state: "revoked" },
  rotate,
);

check(
  "revoked custody cannot rotate",
  inactive.outcome === "denied" &&
    inactive.reason === "custody_not_active",
);

const uncertain = modelTokenCustodyTransition(
  { ...snapshot, state: "uncertain" },
  rotate,
);

check(
  "uncertain custody cannot rotate",
  uncertain.outcome === "denied" &&
    uncertain.reason === "custody_not_active",
);

const unauthorized = modelTokenCustodyTransition(
  snapshot,
  { ...rotate, authorized: false },
);

check(
  "unauthorized transition rejected",
  unauthorized.outcome === "denied" &&
    unauthorized.reason === "unauthorized",
);

const invalidExpiry = modelTokenCustodyTransition(
  snapshot,
  { ...rotate, nextAccessExpiresAtMs: 9000 },
);

check(
  "non-increasing expiration rejected",
  invalidExpiry.outcome === "denied" &&
    invalidExpiry.reason === "invalid_command",
);
const unexpectedCredentialField = modelTokenCustodyTransition(
  {
    ...snapshot,
    refreshToken: "synthetic-value-never-persist",
  } as unknown as typeof snapshot,
  rotate,
);

check(
  "unexpected credential field rejected",
  unexpectedCredentialField.outcome === "denied" &&
    unexpectedCredentialField.reason === "invalid_snapshot",
);

const unexpectedMetadataField = modelTokenCustodyTransition(
  {
    ...snapshot,
    unexpectedField: "synthetic-extra-value",
  } as unknown as typeof snapshot,
  rotate,
);

check(
  "unexpected metadata field rejected",
  unexpectedMetadataField.outcome === "denied" &&
    unexpectedMetadataField.reason === "invalid_snapshot",
);