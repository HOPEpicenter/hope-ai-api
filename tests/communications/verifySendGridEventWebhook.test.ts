import assert from "node:assert/strict";
import {
  createSign,
  generateKeyPairSync
} from "node:crypto";
import {
  verifySendGridEventWebhook
} from "../../src/services/communications/verifySendGridEventWebhook";

async function run(): Promise<void> {
  assert.deepEqual(
    verifySendGridEventWebhook({
      rawBody: Buffer.alloc(0),
      signature: "signature",
      timestamp: "timestamp",
      publicKey: "public-key"
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_VERIFICATION_INPUT"
    }
  );

  assert.deepEqual(
    verifySendGridEventWebhook({
      rawBody: "[]",
      signature: "",
      timestamp: "timestamp",
      publicKey: "public-key"
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_VERIFICATION_INPUT"
    }
  );

  assert.deepEqual(
    verifySendGridEventWebhook({
      rawBody: "[]",
      signature: "signature",
      timestamp: "",
      publicKey: "public-key"
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_VERIFICATION_INPUT"
    }
  );

  assert.deepEqual(
    verifySendGridEventWebhook({
      rawBody: "[]",
      signature: "signature",
      timestamp: "timestamp",
      publicKey: "not-a-valid-public-key"
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_PUBLIC_KEY"
    }
  );

  // Positive cryptographic fixture.
  //
  // SendGrid verifies timestamp + exact raw request payload.
  // Keep the trailing CRLF to prove raw-body preservation matters.
  const raw = '[{"event":"processed"}]\r\n';
  const timestamp = "1791082800";

  const {
    publicKey,
    privateKey
  } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1"
  });

  const publicKeyPem = publicKey.export({
    type: "spki",
    format: "pem"
  }).toString();

  const signer = createSign("SHA256");

  signer.update(timestamp);
  signer.update(raw);
  signer.end();

  const signature = signer
    .sign(privateKey)
    .toString("base64");

  assert.deepEqual(
    verifySendGridEventWebhook({
      rawBody: raw,
      signature,
      timestamp,
      publicKey: publicKeyPem
    }),
    {
      ok: true,
      signatureVerified: true
    }
  );

  assert.deepEqual(
    verifySendGridEventWebhook({
      rawBody: Buffer.from(raw, "utf8"),
      signature,
      timestamp,
      publicKey: publicKeyPem
    }),
    {
      ok: true,
      signatureVerified: true
    }
  );

  // Any raw-body mutation must invalidate the signature.
  assert.deepEqual(
    verifySendGridEventWebhook({
      rawBody: raw.trimEnd(),
      signature,
      timestamp,
      publicKey: publicKeyPem
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_SIGNATURE"
    }
  );

  // The timestamp is part of the signed material too.
  assert.deepEqual(
    verifySendGridEventWebhook({
      rawBody: raw,
      signature,
      timestamp: "1791082801",
      publicKey: publicKeyPem
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_SIGNATURE"
    }
  );

  assert.equal(
    Buffer.from(raw, "utf8").toString("utf8"),
    raw
  );

  console.log(
    "verifySendGridEventWebhook.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});