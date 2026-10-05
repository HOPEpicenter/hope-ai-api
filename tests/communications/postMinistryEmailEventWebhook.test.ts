import assert from "node:assert/strict";
import {
  postMinistryEmailEventWebhook
} from "../../src/functions/postMinistryEmailEventWebhook";

const signature =
  "verified-signature";

const timestamp =
  "1791219600";

const publicKey =
  "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----";

const event = {
  event: "processed",
  timestamp: 1791219600,
  sg_event_id: "event-1",
  sg_message_id: "message-1",
  hope_delivery_id: "delivery-1",
  hope_dispatch_attempt_id: "attempt-1",
  email: "PRIVATE_RECIPIENT@example.org",
  reason: "PRIVATE_PROVIDER_REASON"
};

const raw = JSON.stringify([event]);

function context() {
  const errors: string[] = [];

  return {
    value: {
      log: {
        error(value: string) {
          errors.push(value);
        }
      }
    } as any,
    errors
  };
}

function request(
  overrides: Record<string, unknown> = {}
): any {
  return {
    headers: {
      "x-request-id": "request-1",
      "x-twilio-email-event-webhook-signature":
        signature,
      "x-twilio-email-event-webhook-timestamp":
        timestamp
    },
    bufferBody: Buffer.from(raw, "utf8"),
    body: {
      reconstructed: "MUST_NOT_BE_TRUSTED"
    },
    ...overrides
  };
}

function enabled() {
  return {
    ministryEmailEventWebhook: true
  };
}

async function run(): Promise<void> {
  {
    const c = context();
    let configReads = 0;
    let verifies = 0;
    let normalizes = 0;

    await postMinistryEmailEventWebhook(
      c.value,
      request(),
      {
        getFlags: () => ({
          ministryEmailEventWebhook: false
        }),
        getPublicKey: () => {
          configReads += 1;
          return publicKey;
        },
        verify: () => {
          verifies += 1;
          return {
            ok: true,
            signatureVerified: true
          };
        },
        normalize: () => {
          normalizes += 1;
          throw new Error("must not normalize");
        }
      }
    );

    assert.equal(c.value.res.status, 404);
    assert.equal(configReads, 0);
    assert.equal(verifies, 0);
    assert.equal(normalizes, 0);
  }

  {
    const c = context();
    let verifies = 0;

    await postMinistryEmailEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getPublicKey: () => "",
        verify: () => {
          verifies += 1;
          throw new Error("must not verify");
        }
      }
    );

    assert.equal(c.value.res.status, 503);
    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_EVENT_WEBHOOK_NOT_CONFIGURED"
    );
    assert.equal(verifies, 0);
  }

  {
    const c = context();
    let verifies = 0;

    await postMinistryEmailEventWebhook(
      c.value,
      request({
        headers: {
          "x-request-id": "request-1"
        }
      }),
      {
        getFlags: enabled,
        getPublicKey: () => publicKey,
        verify: () => {
          verifies += 1;
          throw new Error("must not verify");
        }
      }
    );

    assert.equal(c.value.res.status, 401);
    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_EVENT_WEBHOOK_AUTH_REQUIRED"
    );
    assert.equal(verifies, 0);
  }

  {
    const c = context();
    let verifies = 0;
    let normalizes = 0;

    await postMinistryEmailEventWebhook(
      c.value,
      request({
        bufferBody: undefined,
        rawBody: undefined,
        body: [event]
      }),
      {
        getFlags: enabled,
        getPublicKey: () => publicKey,
        verify: () => {
          verifies += 1;
          throw new Error("must not verify");
        },
        normalize: () => {
          normalizes += 1;
          throw new Error("must not normalize");
        }
      }
    );

    assert.equal(c.value.res.status, 400);
    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_EVENT_WEBHOOK_RAW_BODY_REQUIRED"
    );
    assert.equal(verifies, 0);
    assert.equal(normalizes, 0);
  }

  {
    const c = context();
    let normalizes = 0;

    await postMinistryEmailEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getPublicKey: () => publicKey,
        verify: input => {
          assert(Buffer.isBuffer(input.rawBody));
          assert.equal(
            input.rawBody.toString("utf8"),
            raw
          );
          assert.equal(input.signature, signature);
          assert.equal(input.timestamp, timestamp);
          assert.equal(input.publicKey, publicKey);

          return {
            ok: false,
            code: "INVALID_WEBHOOK_SIGNATURE"
          };
        },
        normalize: () => {
          normalizes += 1;
          throw new Error("must not normalize");
        }
      }
    );

    assert.equal(c.value.res.status, 403);
    assert.equal(
      c.value.res.body.error.code,
      "INVALID_WEBHOOK_SIGNATURE"
    );
    assert.equal(normalizes, 0);
  }

  {
    const c = context();
    let verifies = 0;
    let normalizes = 0;

    await postMinistryEmailEventWebhook(
      c.value,
      request({
        bufferBody: Buffer.from(
          "{not-json",
          "utf8"
        )
      }),
      {
        getFlags: enabled,
        getPublicKey: () => publicKey,
        verify: input => {
          verifies += 1;

          assert.equal(
            input.rawBody.toString(),
            "{not-json"
          );

          return {
            ok: true,
            signatureVerified: true
          };
        },
        normalize: () => {
          normalizes += 1;
          throw new Error("must not normalize");
        }
      }
    );

    assert.equal(verifies, 1);
    assert.equal(normalizes, 0);
    assert.equal(c.value.res.status, 400);
    assert.equal(
      c.value.res.body.error.code,
      "INVALID_MINISTRY_EMAIL_EVENT_WEBHOOK_PAYLOAD"
    );
  }

  {
    const c = context();
    let normalizes = 0;

    const objectRaw = JSON.stringify(event);

    await postMinistryEmailEventWebhook(
      c.value,
      request({
        bufferBody: Buffer.from(
          objectRaw,
          "utf8"
        )
      }),
      {
        getFlags: enabled,
        getPublicKey: () => publicKey,
        verify: () => ({
          ok: true,
          signatureVerified: true
        }),
        normalize: () => {
          normalizes += 1;
          throw new Error("must not normalize");
        }
      }
    );

    assert.equal(c.value.res.status, 400);
    assert.equal(normalizes, 0);
  }

  {
    const c = context();
    let verifies = 0;
    let normalizes = 0;

    await postMinistryEmailEventWebhook(
      c.value,
      request({
        bufferBody: Buffer.from(
          raw,
          "utf8"
        ),
        rawBody: "WRONG_RAW_FALLBACK"
      }),
      {
        getFlags: enabled,
        getPublicKey: () => publicKey,
        verify: input => {
          verifies += 1;

          assert(Buffer.isBuffer(input.rawBody));
          assert.equal(
            input.rawBody.toString("utf8"),
            raw
          );

          return {
            ok: true,
            signatureVerified: true
          };
        },
        normalize: input => {
          normalizes += 1;

          assert.equal(
            input.expectedDeliveryId,
            "delivery-1"
          );
          assert.equal(
            input.expectedDispatchAttemptId,
            "attempt-1"
          );
          assert.equal(
            input.provenance.signatureVerified,
            true
          );
          assert.deepEqual(
            input.event,
            event
          );

          return {
            ok: true,
            eventType: "processed",
            evidence: {
              schemaVersion: 1,
              kind: "provider_accepted",
              source: "verified_provider_event",
              deliveryId: "delivery-1",
              dispatchAttemptId: "attempt-1",
              provider: "sendgrid",
              evidenceId: "event-1",
              observedAt:
                "2026-10-05T17:00:00.000Z",
              providerMessageId: "message-1"
            }
          };
        }
      }
    );

    assert.equal(verifies, 1);
    assert.equal(normalizes, 1);
    assert.equal(c.value.res.status, 503);
    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_EVENT_WEBHOOK_PERSISTENCE_UNAVAILABLE"
    );
    assert.deepEqual(
      c.value.res.body.ingestion,
      {
        receivedCount: 1,
        normalizedCount: 1,
        ignoredCount: 0,
        persisted: false
      }
    );

    const response = JSON.stringify(
      c.value.res.body
    );

    for (const forbidden of [
      "PRIVATE_RECIPIENT",
      "PRIVATE_PROVIDER_REASON",
      "verified-signature",
      "BEGIN PUBLIC KEY",
      "MUST_NOT_BE_TRUSTED"
    ]) {
      assert(
        !response.includes(forbidden),
        `response leaked ${forbidden}`
      );
    }
  }

  {
    const c = context();
    let normalizes = 0;

    await postMinistryEmailEventWebhook(
      c.value,
      request({
        bufferBody: undefined,
        rawBody: raw
      }),
      {
        getFlags: enabled,
        getPublicKey: () => publicKey,
        verify: input => {
          assert.equal(input.rawBody, raw);

          return {
            ok: true,
            signatureVerified: true
          };
        },
        normalize: input => {
          normalizes += 1;

          assert.deepEqual(
            input.event,
            event
          );

          return {
            ok: false,
            code: "UNSUPPORTED_PROVIDER_EVENT"
          };
        }
      }
    );

    assert.equal(normalizes, 1);
    assert.equal(c.value.res.status, 503);
    assert.deepEqual(
      c.value.res.body.ingestion,
      {
        receivedCount: 1,
        normalizedCount: 0,
        ignoredCount: 1,
        persisted: false
      }
    );
  }

  {
    const c = context();

    await postMinistryEmailEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getPublicKey: () => publicKey,
        verify: () => {
          throw new Error(
            "PRIVATE_SIGNATURE PRIVATE_RECIPIENT"
          );
        }
      }
    );

    assert.equal(c.value.res.status, 500);
    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_EVENT_WEBHOOK_FAILED"
    );

    const response = JSON.stringify(
      c.value.res.body
    );

    assert(
      !response.includes("PRIVATE_SIGNATURE")
    );
    assert(
      !response.includes("PRIVATE_RECIPIENT")
    );
  }

  console.log(
    "postMinistryEmailEventWebhook.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});