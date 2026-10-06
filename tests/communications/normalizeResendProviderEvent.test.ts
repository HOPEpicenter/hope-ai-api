import assert from "node:assert/strict";
import {
  RESEND_DELIVERY_EVIDENCE_EVENT_TYPES
} from "../../src/contracts/ministryEmailProviderEvidence.v1";
import {
  normalizeResendProviderEvent
} from "../../src/services/communications/normalizeResendProviderEvent";

const deliveryId =
  "delivery-resend-evidence-1";

const attemptId =
  "attempt-resend-evidence-1";

const evidenceId =
  "msg_resend_webhook_1";

function event(
  eventType: string = "email.sent"
): Record<string, unknown> {
  return {
    type: eventType,
    created_at: "2026-10-05T22:45:00.000Z",
    data: {
      email_id: "resend-email-1",
      created_at:
        "2026-10-05T22:44:59.000Z",
      from:
        "PRIVATE_FROM@example.org",
      to: [
        "PRIVATE_RECIPIENT@example.org"
      ],
      subject:
        "PRIVATE_SUBJECT",
      tags: {
        hope_delivery_id:
          deliveryId,
        hope_dispatch_attempt_id:
          attemptId,
        private_tag:
          "PRIVATE_TAG_VALUE"
      },
      bounce: {
        message:
          "PRIVATE_BOUNCE_MESSAGE"
      }
    }
  };
}

function normalize(
  rawEvent: unknown,
  signatureVerified = true,
  id = evidenceId
) {
  return normalizeResendProviderEvent({
    expectedDeliveryId:
      deliveryId,
    expectedDispatchAttemptId:
      attemptId,
    evidenceId: id,
    provenance: {
      signatureVerified
    },
    event: rawEvent
  });
}

async function run(): Promise<void> {
  for (
    const eventType of
    RESEND_DELIVERY_EVIDENCE_EVENT_TYPES
  ) {
    const result =
      normalize(
        event(eventType)
      );

    assert.equal(
      result.ok,
      true
    );

    if (!result.ok) {
      throw new Error(
        `Expected ${eventType} to normalize`
      );
    }

    assert.equal(
      result.eventType,
      eventType
    );

    assert.deepEqual(
      result.evidence,
      {
        schemaVersion: 1,
        kind: "provider_accepted",
        source:
          "verified_provider_event",
        deliveryId,
        dispatchAttemptId:
          attemptId,
        provider: "resend",
        evidenceId,
        observedAt:
          "2026-10-05T22:45:00.000Z",
        providerMessageId:
          "resend-email-1"
      }
    );

    const serialized =
      JSON.stringify(result);

    for (const forbidden of [
      "PRIVATE_FROM",
      "PRIVATE_RECIPIENT",
      "PRIVATE_SUBJECT",
      "PRIVATE_TAG_VALUE",
      "PRIVATE_BOUNCE_MESSAGE"
    ]) {
      assert(
        !serialized.includes(forbidden),
        `${eventType} leaked ${forbidden}`
      );
    }
  }

  assert.deepEqual(
    normalize(
      event("email.sent"),
      false
    ),
    {
      ok: false,
      code:
        "UNVERIFIED_PROVIDER_EVENT"
    }
  );

  for (const unsupported of [
    "email.opened",
    "email.clicked",
    "email.scheduled",
    "email.suppressed",
    "email.received",
    "contact.updated"
  ]) {
    assert.deepEqual(
      normalize(
        event(unsupported)
      ),
      {
        ok: false,
        code:
          "UNSUPPORTED_PROVIDER_EVENT"
      },
      `${unsupported} must remain unsupported`
    );
  }

  {
    const mismatched =
      event();

    const data =
      mismatched.data as
      Record<string, unknown>;

    const tags =
      data.tags as
      Record<string, unknown>;

    tags.hope_delivery_id =
      "different-delivery";

    assert.deepEqual(
      normalize(mismatched),
      {
        ok: false,
        code:
          "PROVIDER_EVENT_CORRELATION_MISMATCH"
      }
    );
  }

  {
    const mismatched =
      event();

    const data =
      mismatched.data as
      Record<string, unknown>;

    const tags =
      data.tags as
      Record<string, unknown>;

    tags.hope_dispatch_attempt_id =
      "different-attempt";

    assert.deepEqual(
      normalize(mismatched),
      {
        ok: false,
        code:
          "PROVIDER_EVENT_CORRELATION_MISMATCH"
      }
    );
  }

  for (const missing of [
    "created_at",
    "data"
  ]) {
    const malformed =
      event();

    delete malformed[missing];

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVENT"
      },
      `missing ${missing} must be invalid`
    );
  }

  for (const missing of [
    "email_id",
    "tags"
  ]) {
    const malformed =
      event();

    const data =
      malformed.data as
      Record<string, unknown>;

    delete data[missing];

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVENT"
      },
      `missing data.${missing} must be invalid`
    );
  }

  for (const missing of [
    "hope_delivery_id",
    "hope_dispatch_attempt_id"
  ]) {
    const malformed =
      event();

    const data =
      malformed.data as
      Record<string, unknown>;

    const tags =
      data.tags as
      Record<string, unknown>;

    delete tags[missing];

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVENT"
      },
      `missing tag ${missing} must be invalid`
    );
  }

  {
    const malformed =
      event();

    malformed.created_at =
      "not-an-iso-date";

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVENT"
      }
    );
  }

  {
    const malformed =
      event();

    const data =
      malformed.data as
      Record<string, unknown>;

    data.email_id = "";

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVENT"
      }
    );
  }

  {
    const malformed =
      event();

    const data =
      malformed.data as
      Record<string, unknown>;

    data.tags = [];

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVENT"
      }
    );
  }

  assert.deepEqual(
    normalize(
      event(),
      true,
      ""
    ),
    {
      ok: false,
      code:
        "INVALID_PROVIDER_EVENT"
    }
  );

  assert.deepEqual(
    normalize(null),
    {
      ok: false,
      code:
        "INVALID_PROVIDER_EVENT"
    }
  );

  assert.deepEqual(
    normalize([]),
    {
      ok: false,
      code:
        "INVALID_PROVIDER_EVENT"
    }
  );

  console.log(
    "normalizeResendProviderEvent.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});