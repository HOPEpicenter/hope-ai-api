import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import {
  issueKioskReviewCursorV1,
  verifyKioskReviewCursorV1
} from "../../src/services/visitors/kioskReviewCursorV1";

const secret = randomBytes(32).toString("base64url");
const otherSecret = randomBytes(32).toString("base64url");

function issue(
  overrides: Record<string, unknown> = {}
): string {
  return issueKioskReviewCursorV1({
    actorId: "synthetic-admin-a",
    limit: 25,
    secret,
    nowSeconds: 10000,
    continuationToken: "PRIVATE_SYNTHETIC_AZURE_TOKEN",
    ...overrides
  });
}

function verify(
  cursor: string,
  overrides: Record<string, unknown> = {}
): string {
  return verifyKioskReviewCursorV1({
    cursor,
    actorId: "synthetic-admin-a",
    limit: 25,
    secret,
    nowSeconds: 10001,
    ...overrides
  });
}

test("authorized administrator can resume a page", () => {
  const cursor = issue();

  assert.equal(
    verify(cursor),
    "PRIVATE_SYNTHETIC_AZURE_TOKEN"
  );
});

test("HTTP cursor does not reveal storage continuation", () => {
  const cursor = issue();

  assert.equal(
    cursor.includes("PRIVATE_SYNTHETIC_AZURE_TOKEN"),
    false
  );

  assert.equal(
    Buffer.from(cursor, "base64url")
      .toString("utf8")
      .includes("PRIVATE_SYNTHETIC_AZURE_TOKEN"),
    false
  );
});

test("cursor is bound to verified administrator", () => {
  const cursor = issue();

  assert.throws(
    () => verify(cursor, { actorId: "synthetic-admin-b" }),
    /INVALID_KIOSK_REVIEW_CURSOR/
  );
});

test("cursor is bound to page limit", () => {
  const cursor = issue();

  assert.throws(
    () => verify(cursor, { limit: 10 }),
    /INVALID_KIOSK_REVIEW_CURSOR/
  );
});

test("expired cursor is rejected", () => {
  const cursor = issue();

  assert.throws(
    () => verify(cursor, { nowSeconds: 10900 }),
    /INVALID_KIOSK_REVIEW_CURSOR/
  );
});

test("future-issued cursor is rejected", () => {
  const cursor = issue();

  assert.throws(
    () => verify(cursor, { nowSeconds: 9900 }),
    /INVALID_KIOSK_REVIEW_CURSOR/
  );
});

test("modified authentication tag is rejected", () => {
  const parts = issue().split(".");
  const tag = parts[3];

  parts[3] = (tag[0] === "A" ? "B" : "A") +
    tag.slice(1);

  assert.throws(
    () => verify(parts.join(".")),
    /INVALID_KIOSK_REVIEW_CURSOR/
  );
});

test("wrong encryption key is rejected", () => {
  assert.throws(
    () => verify(issue(), { secret: otherSecret }),
    /INVALID_KIOSK_REVIEW_CURSOR/
  );
});

test("malformed cursor is rejected", () => {
  for (const cursor of [
    "",
    "not-a-cursor",
    "v1.invalid.invalid.invalid",
    "x".repeat(8193)
  ]) {
    assert.throws(
      () => verify(cursor),
      /INVALID_KIOSK_REVIEW_CURSOR/
    );
  }
});

test("missing or short key is rejected", () => {
  for (const badSecret of [
    "",
    "test",
    randomBytes(16).toString("base64url")
  ]) {
    assert.throws(
      () => issue({ secret: badSecret }),
      /INVALID_KIOSK_REVIEW_CURSOR/
    );
  }
});

test("invalid storage token is rejected", () => {
  for (const token of [
    "",
    "a".repeat(4097),
    "bad\ncursor"
  ]) {
    assert.throws(
      () => issue({ continuationToken: token }),
      /INVALID_KIOSK_REVIEW_CURSOR/
    );
  }
});

test("two encrypted cursors use distinct nonces", () => {
  const first = issue();
  const second = issue();

  assert.notEqual(first, second);
  assert.equal(
    first.split(".")[1] === second.split(".")[1],
    false
  );
  assert.equal(verify(first), verify(second));
});

test("invalid administrator or limit is rejected", () => {
  assert.throws(
    () => issue({ actorId: "" }),
    /INVALID_KIOSK_REVIEW_CURSOR/
  );

  assert.throws(
    () => issue({ limit: 26 }),
    /INVALID_KIOSK_REVIEW_CURSOR/
  );
});