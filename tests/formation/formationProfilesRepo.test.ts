import assert from "node:assert/strict";

function encodeCursor(token?: string): string | undefined {
  const t = String(token ?? "").trim();

  if (!t) return undefined;

  return Buffer.from(t, "utf8").toString("base64");
}

function safeDecodeCursor(cursor?: string): string | undefined {
  const c = String(cursor ?? "").trim();

  if (!c) return undefined;

  if (!/^[A-Za-z0-9+/=]+$/.test(c)) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(c, "base64").toString("utf8");

    if (!decoded.trim()) {
      return undefined;
    }

    return decoded;
  } catch {
    return undefined;
  }
}

const original = "continuation-token-123";

const encoded = encodeCursor(original);

assert.ok(encoded);

const decoded = safeDecodeCursor(encoded);

assert.equal(decoded, original);

assert.equal(
  safeDecodeCursor("%%%invalid%%%"),
  undefined,
  "invalid cursors should fail safely"
);

assert.equal(
  safeDecodeCursor(""),
  undefined,
  "empty cursors should fail safely"
);

console.log("formationProfilesRepo.test.ts passed");
