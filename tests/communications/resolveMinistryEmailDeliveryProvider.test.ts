import assert from "node:assert/strict";
import type {
  MinistryEmailDeliveryProviderAdapter
} from "../../src/services/communications/ministryEmailDeliveryProvider";
import {
  resolveMinistryEmailDeliveryProvider
} from "../../src/services/communications/resolveMinistryEmailDeliveryProvider";

const fakeProvider:
MinistryEmailDeliveryProviderAdapter = {
  async send() {
    throw new Error(
      "resolver test must never send"
    );
  }
};

function run(): void {
  {
    let configReads = 0;
    let creates = 0;

    const result =
      resolveMinistryEmailDeliveryProvider({
        readProviderSelection:
          () => null,
        readResendConfig: () => {
          configReads += 1;
          throw new Error(
            "must not read config"
          );
        },
        createResendProvider: () => {
          creates += 1;
          throw new Error(
            "must not create"
          );
        }
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "MINISTRY_EMAIL_PROVIDER_NOT_CONFIGURED"
      }
    );

    assert.equal(
      configReads,
      0
    );

    assert.equal(
      creates,
      0
    );
  }

  for (const selected of [
    "sendgrid",
    "ses"
  ] as const) {
    let configReads = 0;

    const result =
      resolveMinistryEmailDeliveryProvider({
        readProviderSelection:
          () => selected,
        readResendConfig: () => {
          configReads += 1;
          throw new Error(
            "unsupported provider must not read Resend config"
          );
        }
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "MINISTRY_EMAIL_PROVIDER_NOT_IMPLEMENTED"
      }
    );

    assert.equal(
      configReads,
      0
    );
  }

  {
    let creates = 0;

    const result =
      resolveMinistryEmailDeliveryProvider({
        readProviderSelection:
          () => "resend",
        readResendConfig:
          () => null,
        createResendProvider: () => {
          creates += 1;
          return fakeProvider;
        }
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE"
      }
    );

    assert.equal(
      creates,
      0
    );
  }

  {
    const config = {
      apiKey:
        "test-key",
      from:
        "care@example.org"
    };

    let createdWith:
      typeof config |
      null =
        null;

    const result =
      resolveMinistryEmailDeliveryProvider({
        readProviderSelection:
          () => "resend",
        readResendConfig:
          () => config,
        createResendProvider:
          value => {
            createdWith =
              structuredClone(
                value
              );

            return fakeProvider;
          }
      });

    assert.equal(
      result.ok,
      true
    );

    if (!result.ok) {
      throw new Error(
        "expected resolver success"
      );
    }

    assert.equal(
      result.provider,
      fakeProvider
    );

    assert.deepEqual(
      createdWith,
      config
    );
  }

  {
    const result =
      resolveMinistryEmailDeliveryProvider({
        readProviderSelection: () => {
          throw new Error(
            "PRIVATE_SELECTION_FAILURE"
          );
        }
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE"
      }
    );
  }

  {
    const result =
      resolveMinistryEmailDeliveryProvider({
        readProviderSelection:
          () => "resend",
        readResendConfig: () => {
          throw new Error(
            "PRIVATE_CONFIG_FAILURE"
          );
        }
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE"
      }
    );
  }

  {
    const result =
      resolveMinistryEmailDeliveryProvider({
        readProviderSelection:
          () => "resend",
        readResendConfig:
          () => ({
            apiKey:
              "test-key",
            from:
              "care@example.org"
          }),
        createResendProvider: () => {
          throw new Error(
            "PRIVATE_CONSTRUCTION_FAILURE"
          );
        }
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE"
      }
    );
  }

  console.log(
    "resolveMinistryEmailDeliveryProvider.test.ts passed"
  );
}

run();