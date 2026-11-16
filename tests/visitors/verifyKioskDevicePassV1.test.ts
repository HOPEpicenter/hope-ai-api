import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  verifyKioskDevicePassV1
} from "../../src/services/visitors/verifyKioskDevicePassV1";

const secret = "synthetic-kiosk-signing-key-123456789abcdef";
const otherSecret = "different-synthetic-signing-key-987654321";
const now = Date.parse("2026-11-22T15:00:00.000Z");
const issued = Math.floor(now / 1000);
const deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function sign(overrides: Record<string, unknown> = {}) {
  const claims = {
    v: 1,
    event: "friends-family-2026-11-22",
    purpose: "kiosk-intake",
    jti: deviceId,
    iat: issued,
    exp: issued + 3600,
    ...overrides
  };

  const payload = Buffer.from(
    JSON.stringify(claims),
    "utf8"
  ).toString("base64url");

  const signed = `k1.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(signed)
    .digest("base64url");

  return `${signed}.${signature}`;
}

test("valid signed device yields trusted identity", () => {
  assert.deepEqual(
    verifyKioskDevicePassV1(sign(), secret, now),
    {
      deviceId,
      expiresAtSeconds: issued + 3600
    }
  );
});

test("missing and malformed passes are rejected", () => {
  for (const value of [
    null, undefined, "", "bad", {}, 123,
    "k1.bad.bad"
  ]) {
    assert.equal(
      verifyKioskDevicePassV1(value, secret, now),
      null
    );
  }
});

test("wrong signing key is rejected", () => {
  assert.equal(
    verifyKioskDevicePassV1(
      sign(), otherSecret, now
    ),
    null
  );
});

test("tampered signature is rejected", () => {
  const pass = sign();
  const changed = pass.slice(0, -1) +
    (pass.endsWith("A") ? "B" : "A");

  assert.equal(
    verifyKioskDevicePassV1(changed, secret, now),
    null
  );
});

test("wrong event or purpose is rejected", () => {
  assert.equal(
    verifyKioskDevicePassV1(
      sign({ event: "other" }), secret, now
    ),
    null
  );

  assert.equal(
    verifyKioskDevicePassV1(
      sign({ purpose: "staff-admin" }), secret, now
    ),
    null
  );
});

test("expired device pass is rejected", () => {
  assert.equal(
    verifyKioskDevicePassV1(
      sign(), secret, now + 3600000
    ),
    null
  );
});

test("future-issued pass is rejected", () => {
  assert.equal(
    verifyKioskDevicePassV1(
      sign({ iat: issued + 300 }), secret, now
    ),
    null
  );
});

test("excessive lifetime is rejected", () => {
  assert.equal(
    verifyKioskDevicePassV1(
      sign({ exp: issued + 7201 }), secret, now
    ),
    null
  );
});

test("unexpected fields are rejected", () => {
  assert.equal(
    verifyKioskDevicePassV1(
      sign({ admin: true }), secret, now
    ),
    null
  );
});

test("invalid device ID is rejected", () => {
  assert.equal(
    verifyKioskDevicePassV1(
      sign({ jti: "../device" }), secret, now
    ),
    null
  );
});

test("missing signing configuration fails closed", () => {
  assert.throws(
    () => verifyKioskDevicePassV1(
      sign(), "", now
    ),
    /KIOSK_SIGNING_SECRET_UNAVAILABLE/
  );
});