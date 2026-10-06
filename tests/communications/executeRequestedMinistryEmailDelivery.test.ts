import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import type {
  MinistryEmailDeliveryProviderAdapter,
  MinistryEmailProviderRequest
} from "../../src/services/communications/ministryEmailDeliveryProvider";
import { executeClaimedMinistryEmailDelivery } from "../../src/services/communications/executeRequestedMinistryEmailDelivery";

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-execute-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "requested",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "Approved subject",
  body: "Approved body",
  recipientEmail: "canonical@example.org",
  eligibility: {
    phase5Enabled: true,
    contactConsent: true,
    emailPreference: "granted"
  },
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};

async function run(): Promise<void> {
  const communicationEvents = [{ type: "staff-recorded-history" }];
  const sixWeekEvents = [{ type: "six-week-history" }];
  const communicationBefore = structuredClone(communicationEvents);
  const sixWeekBefore = structuredClone(sixWeekEvents);
  const requests: MinistryEmailProviderRequest[] = [];
  const fakeProvider: MinistryEmailDeliveryProviderAdapter = {
    async send(request) {
      requests.push(request);
      return {
        accepted: true,
        provider: "sendgrid",
        providerMessageId: "fake-message-id"
      };
    }
  };

  const dispatching = {
    ...requested,
    state: "dispatching" as const,
    dispatchAttemptId: "attempt-execute-1",
    dispatchClaimedAt: "2026-10-03T12:00:30.000Z"
  };
  const transitioned = await executeClaimedMinistryEmailDelivery(
    dispatching,
    fakeProvider,
    "2026-10-03T12:01:00.000Z"
  );

  assert.deepEqual(requests, [{
    deliveryId: requested.deliveryId,
    dispatchAttemptId: dispatching.dispatchAttemptId,
    recipientEmail: requested.recipientEmail,
    subject: requested.subject,
    body: requested.body
  }]);
  assert.equal(transitioned.state, "provider_accepted");
  assert.equal(transitioned.dispatchAttemptId, dispatching.dispatchAttemptId);
  assert.equal(transitioned.recipientEmail, "canonical@example.org");
  assert.deepEqual(communicationEvents, communicationBefore);
  assert.deepEqual(sixWeekEvents, sixWeekBefore);

  let calls = 0;
  const shouldNotRun: MinistryEmailDeliveryProviderAdapter = {
    async send() {
      calls += 1;
      return {
        accepted: true,
        provider: "sendgrid",
        providerMessageId: "unexpected"
      };
    }
  };
  await assert.rejects(
    executeClaimedMinistryEmailDelivery(
      transitioned,
      shouldNotRun,
      "2026-10-03T12:02:00.000Z"
    ),
    /dispatching state/
  );
  assert.equal(calls, 0);

  await assert.rejects(
    executeClaimedMinistryEmailDelivery(requested, shouldNotRun, "2026-10-03T12:02:00.000Z"),
    /dispatching state/
  );
  assert.equal(calls, 0);

  console.log("executeRequestedMinistryEmailDelivery.test.ts passed");
}

run();
