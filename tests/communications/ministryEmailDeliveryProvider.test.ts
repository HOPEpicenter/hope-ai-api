import assert from "node:assert/strict";
import type {
  MinistryEmailDeliveryProviderAdapter,
  MinistryEmailProviderRequest,
  MinistryEmailProviderResult
} from "../../src/services/communications/ministryEmailDeliveryProvider";

const received: MinistryEmailProviderRequest[] = [];
const fakeProvider: MinistryEmailDeliveryProviderAdapter = {
  async send(request) {
    received.push(request);
    return {
      accepted: true,
      provider: "sendgrid",
      providerMessageId: "fake-provider-message"
    };
  }
};

async function run(): Promise<void> {
  const request: MinistryEmailProviderRequest = {
    deliveryId: "delivery-1",
    dispatchAttemptId: "attempt-1",
    recipientEmail: "canonical@example.org",
    subject: "Approved subject",
    body: "Approved plain text"
  };

  const result: MinistryEmailProviderResult = await fakeProvider.send(request);
  assert.deepEqual(received, [request]);
  assert.deepEqual(result, {
    accepted: true,
    provider: "sendgrid",
    providerMessageId: "fake-provider-message"
  });

  const failure: MinistryEmailProviderResult = {
    accepted: false,
    provider: "sendgrid",
    failureCode: "provider_unavailable"
  };
  assert.equal(failure.accepted, false);
  assert.equal(failure.failureCode, "provider_unavailable");

  console.log("ministryEmailDeliveryProvider.test.ts passed");
}

run();
