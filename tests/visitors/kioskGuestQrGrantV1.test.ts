import assert from "node:assert/strict";
import { test } from "node:test";
import {
  issueKioskGuestQrGrantV1,
  verifyKioskGuestQrGrantV1
} from "../../src/services/visitors/kioskGuestQrGrantV1";

const secret = "synthetic-guest-qr-secret-123456789abcdef";
const wrongSecret = "different-guest-qr-secret-9876543210xyz";
const sunday = Date.parse("2026-11-22T15:00:00Z");
const saturday = Date.parse("2026-11-21T15:00:00Z");
const monday = Date.parse("2026-11-23T15:00:00Z");

function issue() {
  const token = issueKioskGuestQrGrantV1(
    secret,
    { enabled: true, ownerAuthorized: true },
    sunday,
    3600
  );

  assert.equal(typeof token, "string");
  return token!;
}

test("issuance disabled by default", () => {
  assert.equal(
    issueKioskGuestQrGrantV1(secret, {}, sunday),
    null
  );
});

test("unverified owner cannot issue guest grants", () => {
  assert.equal(
    issueKioskGuestQrGrantV1(
      secret, { enabled: true }, sunday
    ),
    null
  );
});

test("valid Sunday grant verifies only when enabled", () => {
  const token = issue();

  assert.equal(
    verifyKioskGuestQrGrantV1(token, secret, {}, sunday),
    null
  );

  const verified = verifyKioskGuestQrGrantV1(
    token, secret, { enabled: true }, sunday
  );

  assert.match(verified!.grantId, /^[0-9a-f-]{36}$/);
  assert.equal(
    verified!.expiresAtSeconds,
    sunday / 1000 + 3600
  );
});

test("wrong signing secret denied", () => {
  assert.equal(
    verifyKioskGuestQrGrantV1(
      issue(), wrongSecret, { enabled: true }, sunday
    ),
    null
  );
});

test("tampered grant denied", () => {
  const token = issue();
  const changed = token.slice(0, -2) + "AA";

  assert.equal(
    verifyKioskGuestQrGrantV1(
      changed, secret, { enabled: true }, sunday
    ),
    null
  );
});

test("expired grant denied", () => {
  assert.equal(
    verifyKioskGuestQrGrantV1(
      issue(), secret, { enabled: true },
      sunday + 3600000
    ),
    null
  );
});

test("no grants outside event day", () => {
  const enabled = {
    enabled: true,
    ownerAuthorized: true
  };

  assert.equal(
    issueKioskGuestQrGrantV1(
      secret, enabled, saturday
    ),
    null
  );

  assert.equal(
    issueKioskGuestQrGrantV1(
      secret, enabled, monday
    ),
    null
  );

  assert.equal(
    verifyKioskGuestQrGrantV1(
      issue(), secret, { enabled: true }, monday
    ),
    null
  );
});

test("excessive grant lifetime denied", () => {
  assert.equal(
    issueKioskGuestQrGrantV1(
      secret,
      { enabled: true, ownerAuthorized: true },
      sunday,
      21601
    ),
    null
  );
});

test("missing secret denied", () => {
  assert.equal(
    issueKioskGuestQrGrantV1(
      "", { enabled: true, ownerAuthorized: true },
      sunday
    ),
    null
  );

  assert.equal(
    verifyKioskGuestQrGrantV1(
      issue(), "", { enabled: true }, sunday
    ),
    null
  );
});

test("device passes are not guest QR grants", () => {
  assert.equal(
    verifyKioskGuestQrGrantV1(
      "k1.example.example",
      secret,
      { enabled: true },
      sunday
    ),
    null
  );
});