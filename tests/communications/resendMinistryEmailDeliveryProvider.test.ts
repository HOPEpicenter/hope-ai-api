import assert from "node:assert/strict";
import {
  readResendEmailSenderConfig
} from "../../src/config/resendEmailSender";
import {
  ResendMinistryEmailDeliveryProvider,
  type ResendSenderFetch
} from "../../src/services/communications/resendMinistryEmailDeliveryProvider";
import type {
  MinistryEmailProviderRequest
} from "../../src/services/communications/ministryEmailDeliveryProvider";

const request:
MinistryEmailProviderRequest = {
  deliveryId:
    "delivery-123",
  dispatchAttemptId:
    "attempt-456",
  recipientEmail:
    "canonical@example.org",
  subject:
    "Approved subject",
  body:
    "Approved plain text body"
};

function response(
  status: number,
  payload: unknown
) {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

async function run(): Promise<void> {
  {
    const priorKey =
      process.env.RESEND_API_KEY;

    const priorFrom =
      process.env.RESEND_FROM;

    try {
      process.env.RESEND_API_KEY =
        "test-api-key";

      process.env.RESEND_FROM =
        "HOPE <care@example.org>";

      assert.deepEqual(
        readResendEmailSenderConfig(),
        {
          apiKey:
            "test-api-key",
          from:
            "HOPE <care@example.org>"
        }
      );

      delete process.env.RESEND_API_KEY;

      assert.equal(
        readResendEmailSenderConfig(),
        null
      );

      process.env.RESEND_API_KEY =
        "test-api-key";

      delete process.env.RESEND_FROM;

      assert.equal(
        readResendEmailSenderConfig(),
        null
      );
    }
    finally {
      if (priorKey === undefined) {
        delete process.env.RESEND_API_KEY;
      }
      else {
        process.env.RESEND_API_KEY =
          priorKey;
      }

      if (priorFrom === undefined) {
        delete process.env.RESEND_FROM;
      }
      else {
        process.env.RESEND_FROM =
          priorFrom;
      }
    }
  }

  {
    assert.throws(
      () =>
        new ResendMinistryEmailDeliveryProvider(
          {
            apiKey: "",
            from:
              "HOPE <care@example.org>"
          },
          async () =>
            response(
              200,
              { id: "never" }
            )
        ),
      /configuration/
    );
  }

  {
    const calls: Array<{
      url: string;
      init: {
        method: "POST";
        headers:
          Record<string, string>;
        body: string;
      };
    }> = [];

    const fakeFetch:
    ResendSenderFetch =
      async (url, init) => {
        calls.push({
          url,
          init:
            structuredClone(init)
        });

        return response(
          200,
          {
            id:
              "resend-message-1"
          }
        );
      };

    const provider =
      new ResendMinistryEmailDeliveryProvider(
        {
          apiKey:
            "PRIVATE_API_KEY",
          from:
            "HOPE <care@example.org>"
        },
        fakeFetch
      );

    const result =
      await provider.send(
        request
      );

    assert.deepEqual(
      result,
      {
        accepted: true,
        provider: "resend",
        providerMessageId:
          "resend-message-1"
      }
    );

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].url,
      "https://api.resend.com/emails"
    );

    assert.equal(
      calls[0].init.method,
      "POST"
    );

    assert.equal(
      calls[0].init.headers.Authorization,
      "Bearer PRIVATE_API_KEY"
    );

    assert.equal(
      calls[0].init.headers[
        "Content-Type"
      ],
      "application/json"
    );

    const idempotency =
      calls[0].init.headers[
        "Idempotency-Key"
      ];

    assert.match(
      idempotency,
      /^hope-email-[a-f0-9]{64}$/
    );

    assert(
      idempotency.length <= 256
    );

    const payload =
      JSON.parse(
        calls[0].init.body
      );

    assert.deepEqual(
      payload,
      {
        from:
          "HOPE <care@example.org>",
        to: [
          request.recipientEmail
        ],
        subject:
          request.subject,
        text:
          request.body,
        tags: [
          {
            name:
              "hope_delivery_id",
            value:
              request.deliveryId
          },
          {
            name:
              "hope_dispatch_attempt_id",
            value:
              request.dispatchAttemptId
          }
        ]
      }
    );

    await provider.send(
      request
    );

    assert.equal(
      calls[1].init.headers[
        "Idempotency-Key"
      ],
      idempotency,
      "same durable attempt must use the same idempotency key"
    );
  }

  {
    let calls = 0;

    const provider =
      new ResendMinistryEmailDeliveryProvider(
        {
          apiKey:
            "test-key",
          from:
            "care@example.org"
        },
        async () => {
          calls += 1;

          return response(
            200,
            {
              id:
                "must-not-send"
            }
          );
        }
      );

    const invalidIds = [
      {
        ...request,
        deliveryId:
          "contains space"
      },
      {
        ...request,
        dispatchAttemptId:
          "contains/slash"
      },
      {
        ...request,
        deliveryId:
          "x".repeat(257)
      }
    ];

    for (const invalid of invalidIds) {
      assert.deepEqual(
        await provider.send(
          invalid
        ),
        {
          accepted: false,
          provider: "resend",
          failureCode:
            "resend_invalid_request"
        }
      );
    }

    assert.equal(
      calls,
      0
    );
  }

  {
    const provider =
      new ResendMinistryEmailDeliveryProvider(
        {
          apiKey:
            "test-key",
          from:
            "care@example.org"
        },
        async () =>
          response(
            422,
            {
              name:
                "validation_error",
              message:
                "PRIVATE_PROVIDER_DETAIL"
            }
          )
      );

    assert.deepEqual(
      await provider.send(
        request
      ),
      {
        accepted: false,
        provider: "resend",
        failureCode:
          "resend_validation_error"
      }
    );
  }

  {
    const provider =
      new ResendMinistryEmailDeliveryProvider(
        {
          apiKey:
            "test-key",
          from:
            "care@example.org"
        },
        async () =>
          response(
            409,
            {
              name:
                "invalid_idempotent_request"
            }
          )
      );

    assert.deepEqual(
      await provider.send(
        request
      ),
      {
        accepted: false,
        provider: "resend",
        failureCode:
          "resend_invalid_idempotent_request"
      }
    );
  }

  {
    const provider =
      new ResendMinistryEmailDeliveryProvider(
        {
          apiKey:
            "test-key",
          from:
            "care@example.org"
        },
        async () =>
          response(
            409,
            {
              name:
                "concurrent_idempotent_requests"
            }
          )
      );

    await assert.rejects(
      provider.send(request),
      /concurrently unresolved/
    );
  }

  for (const status of [
    429,
    500,
    503
  ]) {
    const provider =
      new ResendMinistryEmailDeliveryProvider(
        {
          apiKey:
            "test-key",
          from:
            "care@example.org"
        },
        async () =>
          response(
            status,
            {
              name:
                "provider_unavailable"
            }
          )
      );

    await assert.rejects(
      provider.send(request),
      /uncertain/
    );
  }

  {
    const provider =
      new ResendMinistryEmailDeliveryProvider(
        {
          apiKey:
            "test-key",
          from:
            "care@example.org"
        },
        async () => {
          throw new Error(
            "PRIVATE_NETWORK_FAILURE"
          );
        }
      );

    await assert.rejects(
      provider.send(request),
      /PRIVATE_NETWORK_FAILURE/
    );
  }

  {
    const provider =
      new ResendMinistryEmailDeliveryProvider(
        {
          apiKey:
            "test-key",
          from:
            "care@example.org"
        },
        async () =>
          response(
            200,
            {}
          )
      );

    await assert.rejects(
      provider.send(request),
      /email id/
    );
  }

  console.log(
    "resendMinistryEmailDeliveryProvider.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});