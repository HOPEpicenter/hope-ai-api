import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

const EVENT = "friends-family-2026-11-22";
const MAX_LIMIT = 25;
const TTL_SECONDS = 900;
const MAX_STORAGE_TOKEN_LENGTH = 4096;
const MAX_HTTP_CURSOR_LENGTH = 8192;

type CursorOptions = {
  actorId: string;
  limit: number;
  secret: string;
  nowSeconds?: number;
};

type IssueOptions = CursorOptions & {
  continuationToken: string;
};

type VerifyOptions = CursorOptions & {
  cursor: string;
};

function invalid(): never {
  throw new Error("INVALID_KIOSK_REVIEW_CURSOR");
}

function validBase64Url(value: string): Buffer {
  if (
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.length > MAX_HTTP_CURSOR_LENGTH
  ) {
    return invalid();
  }

  const decoded = Buffer.from(value, "base64url");

  if (decoded.toString("base64url") !== value) {
    return invalid();
  }

  return decoded;
}

function readKey(secret: string): Buffer {
  if (
    typeof secret !== "string" ||
    secret.length !== 43
  ) {
    return invalid();
  }

  const key = validBase64Url(secret);

  if (key.length !== 32) {
    return invalid();
  }

  return key;
}

function readNow(value?: number): number {
  const now = value ?? Math.floor(Date.now() / 1000);

  if (!Number.isSafeInteger(now) || now < 0) {
    return invalid();
  }

  return now;
}

function checkContext(options: CursorOptions): void {
  if (
    typeof options.actorId !== "string" ||
    options.actorId.length < 1 ||
    options.actorId.length > 200 ||
    options.actorId.trim() !== options.actorId ||
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > MAX_LIMIT
  ) {
    invalid();
  }
}

function checkStorageToken(token: unknown): asserts token is string {
  if (
    typeof token !== "string" ||
    token.length < 1 ||
    token.length > MAX_STORAGE_TOKEN_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(token)
  ) {
    invalid();
  }
}

/**
 * Confidential, authenticated cursor for a single administrator.
 *
 * The key must be a dedicated, server-provided 32-byte key
 * encoded as canonical base64url. Never derive it from
 * device passes, a request header or an API key.
 *
 * The Azure continuation token is encrypted, not merely signed.
 */
export function issueKioskReviewCursorV1(
  options: IssueOptions
): string {
  checkContext(options);
  checkStorageToken(options.continuationToken);

  const key = readKey(options.secret);
  const now = readNow(options.nowSeconds);

  const payload = {
    version: 1,
    event: EVENT,
    actorId: options.actorId,
    limit: options.limit,
    issuedAt: now,
    expiresAt: now + TTL_SECONDS,
    continuationToken: options.continuationToken
  };

  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from("hope-kiosk-review-cursor-v1"));

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  const cursor = [
    "v1",
    nonce.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url")
  ].join(".");

  if (cursor.length > MAX_HTTP_CURSOR_LENGTH) {
    invalid();
  }

  return cursor;
}

/**
 * Only call this after verifying the administrator's identity.
 * Any failure returns the same non-sensitive error.
 */
export function verifyKioskReviewCursorV1(
  options: VerifyOptions
): string {
  checkContext(options);

  if (
    typeof options.cursor !== "string" ||
    options.cursor.length > MAX_HTTP_CURSOR_LENGTH
  ) {
    invalid();
  }

  const parts = options.cursor.split(".");

  if (parts.length !== 4 || parts[0] !== "v1") {
    invalid();
  }

  const key = readKey(options.secret);
  const nonce = validBase64Url(parts[1]);
  const encrypted = validBase64Url(parts[2]);
  const tag = validBase64Url(parts[3]);

  if (
    nonce.length !== 12 ||
    tag.length !== 16 ||
    encrypted.length < 1
  ) {
    invalid();
  }

  let payload: any;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      nonce
    );

    decipher.setAAD(
      Buffer.from("hope-kiosk-review-cursor-v1")
    );
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    payload = JSON.parse(plaintext.toString("utf8"));
  } catch {
    invalid();
  }

  const now = readNow(options.nowSeconds);

  if (
    !payload ||
    Array.isArray(payload) ||
    payload.version !== 1 ||
    payload.event !== EVENT ||
    payload.actorId !== options.actorId ||
    payload.limit !== options.limit ||
    !Number.isSafeInteger(payload.issuedAt) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt - payload.issuedAt !== TTL_SECONDS ||
    payload.issuedAt > now + 30 ||
    payload.expiresAt <= now
  ) {
    invalid();
  }

  checkStorageToken(payload.continuationToken);

  return payload.continuationToken;
}
/**
 * Validate the dedicated review key before any storage read.
 * Never return, log or derive this key from a request.
 */
export function requireKioskReviewCursorKeyV1(
  secret: string
): void {
  readKey(secret);
}