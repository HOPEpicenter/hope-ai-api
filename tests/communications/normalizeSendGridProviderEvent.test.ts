import assert from "node:assert/strict";
import {
  SENDGRID_ACCEPTANCE_EVENT_TYPES
} from "../../src/contracts/ministryEmailProviderEvidence.v1";
import {
  normalizeSendGridProviderEvent
} from "../../src/services/communications/normalizeSendGridProviderEvent";

const deliveryId = "delivery-provider-evidence-1";
const attemptId = "attempt-provider-evidence-1";

function event(
  eventType: string = "processed"
): Record<string, unknown> {
  return {
    event: eventType,
    timestamp: 1791082800,
    sg_event_id: "sendgrid-event-1",
    sg_message_id: "sendgrid-message-1",
    hope_delivery_id: deliveryId,
    hope_dispatch_attempt_id: attemptId,

    // These provider fields are deliberately present to prove that the
    // normalizer does not propagate recipient/provider-detail content.
    email: "PRIVATE_RECIPIENT@example.org",
    reason: "PRIVATE_PROVIDER_REASON",
    response: "PRIVATE_PROVIDER_RESPONSE",
    domain: "private.example.org"
  };
}

function normalize(
  rawEvent: unknown,
  signatureVerified = true
) {
  return normalizeSendGridProviderEvent({
    expectedDeliveryId: deliveryId,
    expectedDispatchAttemptId: attemptId,
    provenance: {
      signatureVerified
    },
    event: rawEvent
  });
}

async function run(): Promise<void> {
  for (const eventType of SENDGRID_ACCEPTANCE_EVENT_TYPES) {
    const result = normalize(event(eventType));

    assert.equal(result.ok, true);

    if (!result.ok) {
      throw new Error(
        `Expected ${eventType} to normalize`
      );
    }

    assert.equal(result.eventType, eventType);
    assert.deepEqual(result.evidence, {
      schemaVersion: 1,
      kind: "provider_accepted",
      source: "verified_provider_event",
      deliveryId,
      dispatchAttemptId: attemptId,
      provider: "sendgrid",
      evidenceId: "sendgrid-event-1",
      observedAt: "2026-10-04T03:00:00.000Z",
      providerMessageId: "sendgrid-message-1"
    });

    const serialized = JSON.stringify(result);

    for (const forbidden of [
      "PRIVATE_RECIPIENT",
      "PRIVATE_PROVIDER_REASON",
      "PRIVATE_PROVIDER_RESPONSE",
      "private.example.org"
    ]) {
      assert(
        !serialized.includes(forbidden),
        `${eventType} leaked ${forbidden}`
      );
    }
  }

  assert.deepEqual(
    normalize(event("processed"), false),
    {
      ok: false,
      code: "UNVERIFIED_PROVIDER_EVENT"
    }
  );

  for (const unsupported of [
    "open",
    "click",
    "spamreport",
    "unsubscribe",
    "group_unsubscribe",
    "group_resubscribe"
  ]) {
    assert.deepEqual(
      normalize(event(unsupported)),
      {
        ok: false,
        code: "UNSUPPORTED_PROVIDER_EVENT"
      }
    );
  }

  {
    const mismatchedDelivery = event();
    mismatchedDelivery.hope_delivery_id =
      "different-delivery";

    assert.deepEqual(
      normalize(mismatchedDelivery),
      {
        ok: false,
        code: "PROVIDER_EVENT_CORRELATION_MISMATCH"
      }
    );
  }

  {
    const mismatchedAttempt = event();
    mismatchedAttempt.hope_dispatch_attempt_id =
      "different-attempt";

    assert.deepEqual(
      normalize(mismatchedAttempt),
      {
        ok: false,
        code: "PROVIDER_EVENT_CORRELATION_MISMATCH"
      }
    );
  }

  for (const missing of [
    "sg_event_id",
    "sg_message_id",
    "hope_delivery_id",
    "hope_dispatch_attempt_id",
    "timestamp"
  ]) {
    const malformed = event();
    delete malformed[missing];

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code: "INVALID_PROVIDER_EVENT"
      },
      `missing ${missing} must be invalid`
    );
  }

  {
    const malformed = event();
    malformed.timestamp = "1791082800";

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code: "INVALID_PROVIDER_EVENT"
      }
    );
  }

  {
    const malformed = event();
    malformed.sg_message_id = "";

    assert.deepEqual(
      normalize(malformed),
      {
        ok: false,
        code: "INVALID_PROVIDER_EVENT"
      }
    );
  }

  assert.deepEqual(
    normalize(null),
    {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    }
  );

  assert.deepEqual(
    normalize([]),
    {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    }
  );

  console.log(
    "normalizeSendGridProviderEvent.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});