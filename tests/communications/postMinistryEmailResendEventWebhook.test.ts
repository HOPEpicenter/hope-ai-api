import assert from "node:assert/strict";
import {
  readResendMinistryEmailEventWebhookSigningSecret
} from "../../src/config/ministryEmailEventWebhook";
import {
  postMinistryEmailResendEventWebhook
} from "../../src/functions/postMinistryEmailResendEventWebhook";

const messageId =
  "msg_resend_webhook_1";

const timestamp =
  "1791219600";

const signature =
  "v1,verified-signature";

const signingSecret =
  "whsec_TEST_SIGNING_SECRET";

const event = {
  type: "email.delivered",
  created_at:
    "2026-10-05T22:45:00.000Z",
  data: {
    email_id:
      "resend-email-1",
    from:
      "PRIVATE_FROM@example.org",
    to: [
      "PRIVATE_RECIPIENT@example.org"
    ],
    subject:
      "PRIVATE_SUBJECT",
    tags: {
      hope_delivery_id:
        "delivery-1",
      hope_dispatch_attempt_id:
        "attempt-1"
    }
  }
};

const raw =
  JSON.stringify(event);

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
      "x-request-id":
        "request-resend-1",
      "svix-id":
        messageId,
      "svix-timestamp":
        timestamp,
      "svix-signature":
        signature
    },
    bufferBody:
      Buffer.from(
        raw,
        "utf8"
      ),
    body: {
      reconstructed:
        "MUST_NOT_BE_TRUSTED"
    },
    ...overrides
  };
}

function enabled() {
  return {
    ministryEmailEventWebhook: true
  };
}

function delivery() {
  return {
    schemaVersion: 1 as const,
    deliveryId:
      "delivery-1",
    communicationId:
      "communication-1",
    visitorId:
      "visitor-1",
    channel: "email" as const,
    state: "dispatching" as const,
    requestedAt:
      "2026-10-05T22:40:00.000Z",
    requestedBy:
      "staff-1",
    subject:
      "private",
    body:
      "private",
    recipientEmail:
      "private@example.org",
    eligibility: {
      phase5Enabled: true as const,
      contactConsent: true as const,
      emailPreference:
        "granted" as const
    },
    dispatchAttemptId:
      "attempt-1",
    dispatchClaimedAt:
      "2026-10-05T22:41:00.000Z",
    provider: null,
    providerMessageId: null,
    providerAcceptedAt: null,
    failedAt: null,
    failureCode: null
  };
}

async function run(): Promise<void> {
  {
    const prior =
      process.env
        .RESEND_EVENT_WEBHOOK_SIGNING_SECRET;

    try {
      process.env
        .RESEND_EVENT_WEBHOOK_SIGNING_SECRET =
          "  whsec_config_test  ";

      assert.equal(
        readResendMinistryEmailEventWebhookSigningSecret(),
        "whsec_config_test"
      );

      delete process.env
        .RESEND_EVENT_WEBHOOK_SIGNING_SECRET;

      assert.equal(
        readResendMinistryEmailEventWebhookSigningSecret(),
        ""
      );
    }
    finally {
      if (prior === undefined) {
        delete process.env
          .RESEND_EVENT_WEBHOOK_SIGNING_SECRET;
      }
      else {
        process.env
          .RESEND_EVENT_WEBHOOK_SIGNING_SECRET =
            prior;
      }
    }
  }

  {
    const c = context();
    let providerReads = 0;
    let secretReads = 0;

    await postMinistryEmailResendEventWebhook(
      c.value,
      request(),
      {
        getFlags: () => ({
          ministryEmailEventWebhook: false
        }),
        getProvider: () => {
          providerReads += 1;
          return "resend";
        },
        getSigningSecret: () => {
          secretReads += 1;
          return signingSecret;
        }
      }
    );

    assert.equal(c.value.res.status, 404);
    assert.equal(providerReads, 0);
    assert.equal(secretReads, 0);
  }

  {
    const c = context();
    let secretReads = 0;

    await postMinistryEmailResendEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getProvider: () =>
          "sendgrid",
        getSigningSecret: () => {
          secretReads += 1;
          return signingSecret;
        }
      }
    );

    assert.equal(c.value.res.status, 404);

    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_RESEND_PROVIDER_NOT_ACTIVE"
    );

    assert.equal(secretReads, 0);
  }

  {
    const c = context();
    let verifies = 0;

    await postMinistryEmailResendEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          "",
        verify: () => {
          verifies += 1;
          throw new Error(
            "must not verify"
          );
        }
      }
    );

    assert.equal(c.value.res.status, 503);

    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_NOT_CONFIGURED"
    );

    assert.equal(verifies, 0);
  }

  {
    const c = context();

    await postMinistryEmailResendEventWebhook(
      c.value,
      request({
        headers: {
          "x-request-id":
            "request-resend-1"
        }
      }),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret
      }
    );

    assert.equal(c.value.res.status, 401);
  }

  {
    const c = context();
    let verifies = 0;

    await postMinistryEmailResendEventWebhook(
      c.value,
      request({
        bufferBody:
          undefined,
        rawBody:
          undefined,
        body:
          event
      }),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
        verify: () => {
          verifies += 1;
          throw new Error(
            "must not verify"
          );
        }
      }
    );

    assert.equal(c.value.res.status, 400);
    assert.equal(verifies, 0);
  }

  {
    const c = context();
    let normalizes = 0;

    await postMinistryEmailResendEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
        verify: input => {
          assert(
            Buffer.isBuffer(
              input.rawBody
            )
          );

          assert.equal(
            input.rawBody.toString("utf8"),
            raw
          );

          assert.equal(input.messageId, messageId);
          assert.equal(input.timestamp, timestamp);
          assert.equal(input.signature, signature);
          assert.equal(input.signingSecret, signingSecret);

          return {
            ok: false,
            code:
              "INVALID_WEBHOOK_SIGNATURE"
          };
        },
        normalize: () => {
          normalizes += 1;
          throw new Error(
            "must not normalize"
          );
        }
      }
    );

    assert.equal(c.value.res.status, 403);
    assert.equal(normalizes, 0);
  }

  {
    const c = context();

    await postMinistryEmailResendEventWebhook(
      c.value,
      request({
        bufferBody:
          Buffer.from(
            "{not-json",
            "utf8"
          )
      }),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
        verify: () => ({
          ok: true,
          signatureVerified: true
        })
      }
    );

    assert.equal(c.value.res.status, 400);

    assert.equal(
      c.value.res.body.error.code,
      "INVALID_MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_PAYLOAD"
    );
  }

  {
    const c = context();
    let reads = 0;
    let normalizes = 0;

    const unsupported = {
      ...event,
      type:
        "email.opened"
    };

    const unsupportedRaw =
      JSON.stringify(
        unsupported
      );

    await postMinistryEmailResendEventWebhook(
      c.value,
      request({
        bufferBody:
          Buffer.from(
            unsupportedRaw,
            "utf8"
          )
      }),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
        verify: () => ({
          ok: true,
          signatureVerified: true
        }),
        readDelivery: async () => {
          reads += 1;
          throw new Error(
            "unsupported event must not read delivery"
          );
        },
        normalize: () => {
          normalizes += 1;
          throw new Error(
            "unsupported event must not normalize"
          );
        }
      }
    );

    assert.equal(c.value.res.status, 200);
    assert.equal(reads, 0);
    assert.equal(normalizes, 0);

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
    let verifies = 0;
    let normalizes = 0;

    await postMinistryEmailResendEventWebhook(
      c.value,
      request({
        rawBody:
          "WRONG_RAW_FALLBACK"
      }),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
        verify: input => {
          verifies += 1;

          assert(
            Buffer.isBuffer(
              input.rawBody
            )
          );

          assert.equal(
            input.rawBody.toString("utf8"),
            raw
          );

          return {
            ok: true,
            signatureVerified: true
          };
        },
        readDelivery:
          async deliveryId => {
            assert.equal(
              deliveryId,
              "delivery-1"
            );

            return delivery();
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
            input.evidenceId,
            messageId
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
            eventType:
              "email.delivered",
            evidence: {
              schemaVersion: 1,
              kind:
                "provider_accepted",
              source:
                "verified_provider_event",
              deliveryId:
                "delivery-1",
              dispatchAttemptId:
                "attempt-1",
              provider:
                "resend",
              evidenceId:
                messageId,
              observedAt:
                "2026-10-05T22:45:00.000Z",
              providerMessageId:
                "resend-email-1"
            }
          };
        },
        persist: async input => {
          assert.equal(
            input.eventType,
            "email.delivered"
          );

          assert.equal(
            input.evidence.provider,
            "resend"
          );

          assert.equal(
            input.evidence.evidenceId,
            messageId
          );

          assert.equal(
            input.evidence.deliveryId,
            "delivery-1"
          );

          assert.equal(
            input.evidence.dispatchAttemptId,
            "attempt-1"
          );

          return {
            ok: true,
            status: "persisted",
            record: {
              schemaVersion: 1,
              provider: "resend",
              evidenceId:
                messageId,
              deliveryId:
                "delivery-1",
              dispatchAttemptId:
                "attempt-1",
              kind:
                "provider_accepted",
              source:
                "verified_provider_event",
              observedAt:
                "2026-10-05T22:45:00.000Z",
              providerMessageId:
                "resend-email-1",
              eventType:
                "email.delivered",
              evidenceFingerprint:
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            }
          };
        }
      }
    );

    assert.equal(verifies, 1);
    assert.equal(normalizes, 1);
    assert.equal(c.value.res.status, 200);

    assert.deepEqual(
      c.value.res.body.ingestion,
      {
        receivedCount: 1,
        persistedCount: 1,
        replayedCount: 0,
        ignoredCount: 0,
        persisted: true
      }
    );

    const response =
      JSON.stringify(
        c.value.res.body
      );

    for (const forbidden of [
      "PRIVATE_FROM",
      "PRIVATE_RECIPIENT",
      "PRIVATE_SUBJECT",
      "verified-signature",
      "whsec_TEST",
      "MUST_NOT_BE_TRUSTED"
    ]) {
      assert(
        !response.includes(
          forbidden
        ),
        `response leaked ${forbidden}`
      );
    }
  }

  {
    const c = context();
    let normalizes = 0;

    const staleDelivery = {
      ...delivery(),
      dispatchAttemptId:
        "different-attempt"
    };

    await postMinistryEmailResendEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
        verify: () => ({
          ok: true,
          signatureVerified: true
        }),
        readDelivery:
          async () =>
            staleDelivery,
        normalize: () => {
          normalizes += 1;

          throw new Error(
            "must not normalize stale attempt"
          );
        }
      }
    );

    assert.equal(c.value.res.status, 409);

    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_PROVIDER_DISPATCH_ATTEMPT_CONFLICT"
    );

    assert.equal(normalizes, 0);
  }

  {
    const c = context();

    await postMinistryEmailResendEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
        verify: () => ({
          ok: true,
          signatureVerified: true
        }),
        readDelivery: async () =>
          delivery(),
        persist: async () => ({
          ok: false,
          code:
            "PROVIDER_EVIDENCE_PERSISTENCE_UNCERTAIN"
        })
      }
    );

    assert.equal(
      c.value.res.status,
      503
    );

    assert.equal(
      c.value.res.body.error.code,
      "PROVIDER_EVIDENCE_PERSISTENCE_UNCERTAIN"
    );
  }

  {
    const c = context();

    await postMinistryEmailResendEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
        verify: () => ({
          ok: true,
          signatureVerified: true
        }),
        readDelivery: async () =>
          delivery(),
        persist: async input => ({
          ok: true,
          status: "replayed",
          record: {
            schemaVersion: 1,
            provider: "resend",
            evidenceId:
              input.evidence.evidenceId,
            deliveryId:
              input.evidence.deliveryId,
            dispatchAttemptId:
              input.evidence.dispatchAttemptId,
            kind:
              "provider_accepted",
            source:
              "verified_provider_event",
            observedAt:
              input.evidence.observedAt,
            providerMessageId:
              input.evidence.providerMessageId,
            eventType:
              input.eventType,
            evidenceFingerprint:
              "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          }
        })
      }
    );

    assert.equal(
      c.value.res.status,
      200
    );

    assert.deepEqual(
      c.value.res.body.ingestion,
      {
        receivedCount: 1,
        persistedCount: 0,
        replayedCount: 1,
        ignoredCount: 0,
        persisted: true
      }
    );
  }

  {
    const c = context();

    await postMinistryEmailResendEventWebhook(
      c.value,
      request(),
      {
        getFlags: enabled,
        getProvider: () =>
          "resend",
        getSigningSecret: () =>
          signingSecret,
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
      "MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_FAILED"
    );

    const response =
      JSON.stringify(
        c.value.res.body
      );

    assert(
      !response.includes(
        "PRIVATE_SIGNATURE"
      )
    );

    assert(
      !response.includes(
        "PRIVATE_RECIPIENT"
      )
    );
  }

  console.log(
    "postMinistryEmailResendEventWebhook.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});