import assert from "node:assert/strict";
import {
  createHmac
} from "node:crypto";
import {
  verifyResendEventWebhook
} from "../../src/services/communications/verifyResendEventWebhook";

const now = 1791219600;
const messageId = "msg_resend_webhook_1";
const timestamp = String(now);

const secretBytes = Buffer.from(
  "hope-resend-webhook-signing-secret-fixture",
  "utf8"
);

const signingSecret =
  `whsec_${secretBytes.toString("base64")}`;

const raw =
  '{"type":"email.delivered","data":{"email_id":"email-1"}}\r\n';

function signature(
  body: Buffer | string = raw,
  id: string = messageId,
  signedTimestamp: string = timestamp
): string {
  const rawBody =
    Buffer.isBuffer(body)
      ? body
      : Buffer.from(body, "utf8");

  const signedPayload =
    Buffer.concat([
      Buffer.from(
        `${id}.${signedTimestamp}.`,
        "utf8"
      ),
      rawBody
    ]);

  return `v1,${
    createHmac(
      "sha256",
      secretBytes
    )
      .update(signedPayload)
      .digest("base64")
  }`;
}

function verify(
  overrides: Partial<{
    rawBody: Buffer | string;
    messageId: string;
    timestamp: string;
    signature: string;
    signingSecret: string;
  }> = {},
  currentTime = now
) {
  return verifyResendEventWebhook(
    {
      rawBody: raw,
      messageId,
      timestamp,
      signature: signature(),
      signingSecret,
      ...overrides
    },
    currentTime
  );
}

async function run(): Promise<void> {
  assert.deepEqual(
    verify(),
    {
      ok: true,
      signatureVerified: true
    }
  );

  assert.deepEqual(
    verify({
      rawBody: Buffer.from(raw, "utf8")
    }),
    {
      ok: true,
      signatureVerified: true
    }
  );

  assert.deepEqual(
    verify({
      signature:
        `v1,${Buffer.alloc(32).toString("base64")} ${signature()}`
    }),
    {
      ok: true,
      signatureVerified: true
    },
    "any valid v1 signature must be accepted"
  );

  assert.deepEqual(
    verify({
      rawBody: raw.trimEnd()
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_SIGNATURE"
    },
    "raw-body mutation must invalidate signature"
  );

  assert.deepEqual(
    verify({
      messageId: "different-message-id"
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_SIGNATURE"
    }
  );

  assert.deepEqual(
    verify({
      signature:
        `v1,${Buffer.alloc(32).toString("base64")}`
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_SIGNATURE"
    }
  );

  assert.deepEqual(
    verify({
      signature: "v2,not-supported"
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_SIGNATURE"
    }
  );

  assert.deepEqual(
    verify({
      signingSecret: "not-a-whsec-secret"
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_SIGNING_SECRET"
    }
  );

  assert.deepEqual(
    verify({
      timestamp: "not-a-timestamp"
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_TIMESTAMP"
    }
  );

  assert.deepEqual(
    verify(
      {
        timestamp: String(
          now - 301
        ),
        signature: signature(
          raw,
          messageId,
          String(now - 301)
        )
      },
      now
    ),
    {
      ok: false,
      code: "INVALID_WEBHOOK_TIMESTAMP"
    },
    "stale signatures must fail closed"
  );

  assert.deepEqual(
    verify(
      {
        timestamp: String(
          now + 301
        ),
        signature: signature(
          raw,
          messageId,
          String(now + 301)
        )
      },
      now
    ),
    {
      ok: false,
      code: "INVALID_WEBHOOK_TIMESTAMP"
    },
    "far-future signatures must fail closed"
  );

  assert.deepEqual(
    verify({
      rawBody: ""
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_VERIFICATION_INPUT"
    }
  );

  assert.deepEqual(
    verify({
      messageId: ""
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_VERIFICATION_INPUT"
    }
  );

  assert.deepEqual(
    verify({
      signature: ""
    }),
    {
      ok: false,
      code: "INVALID_WEBHOOK_VERIFICATION_INPUT"
    }
  );

  assert.equal(
    Buffer.from(raw, "utf8").toString("utf8"),
    raw
  );

  console.log(
    "verifyResendEventWebhook.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});