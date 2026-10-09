import assert from "node:assert/strict";

import {
  evaluateOAuthCredentialOwnership
} from "../../src/services/authorization/oauthCredentialOwnerAuthorization";

const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const staffId = "canonical-staff-test-one";
const sessionId = "33333333-3333-4333-8333-333333333333";

const valid = {
  identity: {
    tenantId,
    objectId,
    staffId
  },
  session: {
    status: "active" as const,
    tenantId,
    entraObjectId: objectId,
    canonicalStaffId: staffId,
    sessionBindingId: sessionId
  },
  storedOwner: {
    tenantId,
    entraObjectId: objectId,
    canonicalStaffId: staffId,
    sessionBindingId: sessionId
  },
  staffStatus: "active" as const,
  credentialStatus: "active" as const
};

const denied = {
  allowed: false,
  reason: "credential_access_denied"
};

assert.deepEqual(evaluateOAuthCredentialOwnership(valid), {
  allowed: true
});

const anotherTenant =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const anotherObject =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const anotherSession =
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const cases = [
  { ...valid, staffStatus: "inactive" as const },
  { ...valid, credentialStatus: "revoked" as const },
  { ...valid, credentialStatus: "expired" as const },
  { ...valid, session: { ...valid.session,
    status: "revoked" as const } },
  { ...valid, session: { ...valid.session,
    status: "expired" as const } },
  { ...valid, identity: { ...valid.identity,
    tenantId: anotherTenant } },
  { ...valid, identity: { ...valid.identity,
    objectId: anotherObject } },
  { ...valid, identity: { ...valid.identity,
    staffId: "other-staff" } },
  { ...valid, session: { ...valid.session,
    tenantId: anotherTenant } },
  { ...valid, session: { ...valid.session,
    entraObjectId: anotherObject } },
  { ...valid, session: { ...valid.session,
    canonicalStaffId: "other-staff" } },
  { ...valid, session: { ...valid.session,
    sessionBindingId: anotherSession } },
  { ...valid, storedOwner: { ...valid.storedOwner,
    tenantId: anotherTenant } },
  { ...valid, storedOwner: { ...valid.storedOwner,
    entraObjectId: anotherObject } },
  { ...valid, storedOwner: { ...valid.storedOwner,
    canonicalStaffId: "other-staff" } },
  { ...valid, storedOwner: { ...valid.storedOwner,
    sessionBindingId: anotherSession } },
  { ...valid, identity: { ...valid.identity,
    tenantId: "INVALID" } },
  { ...valid, session: { ...valid.session,
    sessionBindingId: "" } }
];

for (const input of cases) {
  assert.deepEqual(
    evaluateOAuthCredentialOwnership(input),
    denied
  );
}

// The policy has no administrator or pastoral override.
assert.deepEqual(
  evaluateOAuthCredentialOwnership({
    ...valid,
    storedOwner: {
      ...valid.storedOwner,
      canonicalStaffId: "another-staff"
    }
  }),
  denied
);

assert.deepEqual(
  evaluateOAuthCredentialOwnership(null as never),
  denied
);

console.log("oauthCredentialOwnerAuthorization policy tests passed");
