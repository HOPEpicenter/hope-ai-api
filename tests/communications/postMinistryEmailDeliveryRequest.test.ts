import assert from "node:assert/strict";
import type {
  MinistryEmailDeliveryRecord
} from "../../src/domain/communications/ministryEmailDeliveryContracts";
import {
  postMinistryEmailDeliveryRequest
} from "../../src/functions/postMinistryEmailDeliveryRequest";

const delivery:
MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId:
    "delivery-1",
  communicationId:
    "communication-1",
  visitorId:
    "visitor-1",
  channel:
    "email",
  state:
    "requested",
  requestedAt:
    "2026-10-06T04:00:00.000Z",
  requestedBy:
    "canonical-admin",
  subject:
    "Approved subject",
  body:
    "Approved plain text body",
  recipientEmail:
    "canonical@example.org",
  eligibility: {
    phase5Enabled:
      true,
    contactConsent:
      true,
    emailPreference:
      "granted"
  },
  dispatchAttemptId:
    null,
  dispatchClaimedAt:
    null,
  provider:
    null,
  providerMessageId:
    null,
  providerAcceptedAt:
    null,
  failedAt:
    null,
  failureCode:
    null
};

function context() {
  const errors:
    string[] =
      [];

  return {
    value: {
      res:
        undefined,
      log: {
        error(
          value: string
        ) {
          errors.push(
            value
          );
        }
      }
    } as any,
    errors
  };
}

function request(
  overrides:
    Record<string, unknown> = {}
): any {
  return {
    headers: {
      "x-request-id":
        "request-1"
    },
    body: {
      visitorId:
        "visitor-1",
      deliveryId:
        "delivery-1",
      communicationId:
        "communication-1",
      subject:
        "Approved subject",
      body:
        "Approved plain text body",

      // These must never control backend authority or recipient.
      actorId:
        "caller-controlled-actor",
      recipientEmail:
        "attacker@example.net",

      ...overrides
    }
  };
}

async function run():
Promise<void> {
  {
    const c =
      context();

    let requestCalls =
      0;

    await postMinistryEmailDeliveryRequest(
      c.value,
      request(),
      {
        authorize:
          async () => ({
            ok: false,
            status: 401,
            body: {
              ok: false,
              error:
                "Unauthorized"
            }
          }),
        requestDelivery:
          async () => {
            requestCalls +=
              1;

            throw new Error(
              "must not run"
            );
          }
      }
    );

    assert.equal(
      c.value.res.status,
      401
    );

    assert.equal(
      requestCalls,
      0
    );

    assert.equal(
      c.value.res.body.requestId,
      "request-1"
    );
  }

  {
    const c =
      context();

    let received:
      Record<string, unknown> |
      undefined;

    await postMinistryEmailDeliveryRequest(
      c.value,
      request(),
      {
        authorize:
          async () => ({
            ok: true,
            actorId:
              "canonical-admin"
          }),
        requestDelivery:
          async input => {
            received =
              structuredClone(
                input
              ) as unknown as
                Record<string, unknown>;

            return {
              accepted:
                true,
              status:
                201,
              created:
                true,
              delivery
            };
          }
      }
    );

    assert(received);

    assert.deepEqual(
      received,
      {
        visitorId:
          "visitor-1",
        actorId:
          "canonical-admin",
        deliveryId:
          "delivery-1",
        communicationId:
          "communication-1",
        subject:
          "Approved subject",
        body:
          "Approved plain text body"
      }
    );

    assert.equal(
      "recipientEmail" in received,
      false
    );

    assert.equal(
      c.value.res.status,
      201
    );

    assert.equal(
      c.value.res.body.ok,
      true
    );

    assert.equal(
      c.value.res.body.created,
      true
    );

    assert.equal(
      c.value.res.body.requestId,
      "request-1"
    );

    assert.deepEqual(
      c.value.res.body.delivery,
      delivery
    );
  }

  {
    const c =
      context();

    await postMinistryEmailDeliveryRequest(
      c.value,
      request(),
      {
        authorize:
          async () => ({
            ok: true,
            actorId:
              "canonical-admin"
          }),
        requestDelivery:
          async () => ({
            accepted:
              true,
            status:
              200,
            created:
              false,
            delivery
          })
      }
    );

    assert.equal(
      c.value.res.status,
      200
    );

    assert.equal(
      c.value.res.body.created,
      false
    );
  }

  const failures = [
    {
      status:
        400 as const,
      error:
        "Invalid email delivery request",
      expectedCode:
        "INVALID_MINISTRY_EMAIL_DELIVERY_REQUEST"
    },
    {
      status:
        403 as const,
      error:
        "ACTIVE_CANONICAL_STAFF_REQUIRED",
      expectedCode:
        "ACTIVE_CANONICAL_STAFF_REQUIRED"
    },
    {
      status:
        404 as const,
      error:
        "VISITOR_NOT_FOUND",
      expectedCode:
        "VISITOR_NOT_FOUND"
    },
    {
      status:
        404 as const,
      error:
        "COMMUNICATION_NOT_FOUND",
      expectedCode:
        "COMMUNICATION_NOT_FOUND"
    },
    {
      status:
        409 as const,
      error:
        "CONTACT_CONSENT_REQUIRED",
      expectedCode:
        "CONTACT_CONSENT_REQUIRED"
    },
    {
      status:
        409 as const,
      error:
        "EMAIL_PREFERENCE_REQUIRED",
      expectedCode:
        "EMAIL_PREFERENCE_REQUIRED"
    },
    {
      status:
        503 as const,
      error:
        "PHASE5_COMMUNICATIONS_DISABLED",
      expectedCode:
        "PHASE5_COMMUNICATIONS_DISABLED"
    }
  ];

  for (
    const failure
    of failures
  ) {
    const c =
      context();

    await postMinistryEmailDeliveryRequest(
      c.value,
      request(),
      {
        authorize:
          async () => ({
            ok: true,
            actorId:
              "canonical-admin"
          }),
        requestDelivery:
          async () => ({
            accepted:
              false,
            status:
              failure.status,
            error:
              failure.error
          })
      }
    );

    assert.equal(
      c.value.res.status,
      failure.status
    );

    assert.equal(
      c.value.res.body.error.code,
      failure.expectedCode
    );
  }

  {
    const c =
      context();

    await postMinistryEmailDeliveryRequest(
      c.value,
      request(),
      {
        authorize:
          async () => ({
            ok: true,
            actorId:
              "canonical-admin"
          }),
        requestDelivery:
          async () => ({
            accepted:
              false,
            status:
              409,
            error:
              "PRIVATE_BODY private@example.org"
          })
      }
    );

    assert.equal(
      c.value.res.status,
      409
    );

    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_DELIVERY_REQUEST_REJECTED"
    );

    const serialized =
      JSON.stringify(
        c.value.res
      );

    assert(
      !serialized.includes(
        "PRIVATE_BODY"
      )
    );

    assert(
      !serialized.includes(
        "private@example.org"
      )
    );
  }

  {
    const c =
      context();

    await postMinistryEmailDeliveryRequest(
      c.value,
      request(),
      {
        authorize:
          async () => ({
            ok: true,
            actorId:
              "canonical-admin"
          }),
        requestDelivery:
          async () => {
            throw new Error(
              "PRIVATE_BODY recipient=private@example.org"
            );
          }
      }
    );

    assert.equal(
      c.value.res.status,
      500
    );

    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_DELIVERY_REQUEST_FAILED"
    );

    const serialized =
      JSON.stringify(
        c.value.res
      );

    assert(
      !serialized.includes(
        "PRIVATE_BODY"
      )
    );

    assert(
      !serialized.includes(
        "private@example.org"
      )
    );
  }

  console.log(
    "postMinistryEmailDeliveryRequest.test.ts passed"
  );
}

void run().catch(
  error => {
    console.error(
      error
    );

    process.exitCode =
      1;
  }
);