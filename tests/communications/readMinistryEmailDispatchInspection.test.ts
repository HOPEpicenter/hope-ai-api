import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import {
  readMinistryEmailDispatchInspection,
  type MinistryEmailDispatchInspectionRepository
} from "../../src/services/communications/readMinistryEmailDispatchInspection";

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "inspection-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "requested",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "PRIVATE_SUBJECT",
  body: "PRIVATE_BODY",
  recipientEmail: "private@example.org",
  eligibility: {
    phase5Enabled: true, contactConsent: true, emailPreference: "granted"
  },
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};
const dispatching: MinistryEmailDeliveryRecord = {
  ...requested,
  state: "dispatching",
  dispatchAttemptId: "attempt-1",
  dispatchClaimedAt: "2026-10-03T12:01:00.000Z"
};
const accepted: MinistryEmailDeliveryRecord = {
  ...dispatching,
  state: "provider_accepted",
  provider: "sendgrid",
  providerMessageId: "message-1",
  providerAcceptedAt: "2026-10-03T12:02:00.000Z"
};
const failed: MinistryEmailDeliveryRecord = {
  ...dispatching,
  state: "failed",
  provider: "sendgrid",
  failedAt: "2026-10-03T12:02:00.000Z",
  failureCode: "PRIVATE_FAILURE_TEXT"
};
const resendAccepted: MinistryEmailDeliveryRecord = {
  ...accepted,
  provider: "resend",
  providerMessageId: "resend-message-1"
};
const sesFailed: MinistryEmailDeliveryRecord = {
  ...failed,
  provider: "ses",
  failureCode: "ses_known_rejection"
};

async function inspect(record: MinistryEmailDeliveryRecord | null) {
  let reads = 0;
  const before = structuredClone(record);
  // This dependency exposes reads only; any attempted mutation must fail.
  const repository: MinistryEmailDispatchInspectionRepository = {
    async getById(id) {
      reads += 1;
      assert.equal(id, requested.deliveryId);
      return record;
    }
  };
  const result = await readMinistryEmailDispatchInspection(
    requested.deliveryId,
    { repository, now: () => "2026-10-03T12:11:00.000Z" }
  );
  assert.equal(reads, 1);
  assert.deepEqual(record, before, "inspection leaves the source unchanged");
  const serialized = JSON.stringify(result);
  for (const privateValue of [
    "PRIVATE_SUBJECT", "PRIVATE_BODY", "private@example.org",
    "PRIVATE_FAILURE_TEXT", "communication-1", "visitor-1", "staff-1"
  ]) {
    assert(!serialized.includes(privateValue));
  }
  return result;
}

async function run(): Promise<void> {
  for (const record of [
    requested,
    dispatching,
    accepted,
    failed,
    resendAccepted,
    sesFailed
  ]) {
    const result = await inspect(structuredClone(record));
    assert(result.ok);
    assert.equal(result.inspection.state, record.state);
    assert.equal(result.inspection.resendAuthorized, false);
    assert.equal(result.inspection.reconciliationRequired,
      record.state === "dispatching");
    assert.equal(result.inspection.claimAgeSeconds,
      record.state === "requested" ? null : 600);
    assert.equal(result.inspection.assessment,
      record.state === "requested" ? "not_claimed" :
      record.state === "dispatching" ? "execution_unresolved" :
      "terminal_recorded");
    assert.deepEqual(Object.keys(result.inspection).sort(), [
      "deliveryId", "state", "inspectedAt", "requestedAt",
      "dispatchAttemptId", "dispatchClaimedAt", "claimAgeSeconds",
      "provider", "providerMessageId", "providerAcceptedAt", "failedAt",
      "assessment", "reconciliationRequired", "resendAuthorized"
    ].sort());
  }

  assert.deepEqual(await inspect(null),
    { ok: false, code: "DELIVERY_NOT_FOUND" });

  for (const patch of [
    { deliveryId: "wrong-id" },
    { schemaVersion: 2 },
    { state: "unknown" },
    { requestedAt: "invalid" },
    { dispatchAttemptId: null },
    { dispatchClaimedAt: "invalid" },
    { provider: "sendgrid" }
  ]) {
    const malformed = {
      ...dispatching, ...patch
    } as unknown as MinistryEmailDeliveryRecord;
    assert.deepEqual(await inspect(malformed),
      { ok: false, code: "INVALID_DELIVERY_RECORD" });
  }
  assert.deepEqual(await inspect({
    ...requested, dispatchAttemptId: "unexpected"
  }), { ok: false, code: "INVALID_DELIVERY_RECORD" });
  assert.deepEqual(await inspect({
    ...accepted, providerMessageId: ""
  }), { ok: false, code: "INVALID_DELIVERY_RECORD" });
  assert.deepEqual(await inspect({
    ...failed, failureCode: ""
  }), { ok: false, code: "INVALID_DELIVERY_RECORD" });
  assert.deepEqual(
    await inspect({
      ...accepted,
      provider: "mailgun"
    } as unknown as MinistryEmailDeliveryRecord),
    {
      ok: false,
      code: "INVALID_DELIVERY_RECORD"
    }
  );

  const oldClaim = await inspect({
    ...dispatching, dispatchClaimedAt: "2020-01-01T00:00:00.000Z"
  });
  assert(oldClaim.ok);
  assert.equal(oldClaim.inspection.resendAuthorized, false);
  assert.equal(oldClaim.inspection.assessment, "execution_unresolved");

  const futureClaim = await inspect({
    ...dispatching, dispatchClaimedAt: "2030-01-01T00:00:00.000Z"
  });
  assert(futureClaim.ok);
  assert.equal(futureClaim.inspection.claimAgeSeconds, null);
  assert.equal(futureClaim.inspection.resendAuthorized, false);

  const noRead = {
    async getById(): Promise<MinistryEmailDeliveryRecord | null> {
      throw new Error("Repository must not be accessed");
    }
  };
  assert.deepEqual(await readMinistryEmailDispatchInspection(" ", {
    repository: noRead
  }), { ok: false, code: "INVALID_INSPECTION_INPUT" });
  assert.deepEqual(await readMinistryEmailDispatchInspection("inspection-1", {
    repository: noRead, now: () => "invalid"
  }), { ok: false, code: "INVALID_INSPECTION_INPUT" });

  const unavailable = await readMinistryEmailDispatchInspection(
    requested.deliveryId, {
      repository: {
        async getById() {
          throw new Error("PRIVATE_BODY credential=PRIVATE_SECRET");
        }
      }
    }
  );
  assert.deepEqual(unavailable,
    { ok: false, code: "DELIVERY_INSPECTION_UNAVAILABLE" });

  const originalPhase5 = process.env.FEATURE_PHASE5_COMMUNICATIONS;
  const originalSending = process.env.FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING;
  try {
    process.env.FEATURE_PHASE5_COMMUNICATIONS = "false";
    process.env.FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING = "false";
    const result = await inspect(structuredClone(dispatching));
    assert(result.ok, "inspection remains available while sending is disabled");
  } finally {
    if (originalPhase5 === undefined) {
      delete process.env.FEATURE_PHASE5_COMMUNICATIONS;
    } else {
      process.env.FEATURE_PHASE5_COMMUNICATIONS = originalPhase5;
    }
    if (originalSending === undefined) {
      delete process.env.FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING;
    } else {
      process.env.FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING = originalSending;
    }
  }

  console.log("readMinistryEmailDispatchInspection.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
