import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord, MinistryEmailDeliveryState } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import { readMinistryEmailDispatchInspection } from "../../src/services/communications/readMinistryEmailDispatchInspection";

const voided: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "inspection-void-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "voided",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "PRIVATE_SUBJECT",
  body: "PRIVATE_BODY",
  recipientEmail: "private@example.org",
  eligibility: { phase5Enabled: true, contactConsent: true, emailPreference: "granted" },
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null,
  voidedAt: "2026-10-04T10:00:00.000Z",
  voidedBy: "PRIVATE_ADMIN",
  voidReason: "PRIVATE_VOID_REASON"
};

function inspect(record: unknown) {
  return readMinistryEmailDispatchInspection(voided.deliveryId, {
    repository: { getById: async () => record as MinistryEmailDeliveryRecord },
    now: () => "2026-10-05T10:00:00.000Z"
  });
}

async function run(): Promise<void> {
  const state: MinistryEmailDeliveryState = "voided";
  assert.equal(state, "voided");

  const ok = await inspect(voided);
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.inspection.state, "voided");
  assert.equal(ok.inspection.assessment, "terminal_recorded");
  assert.equal(ok.inspection.reconciliationRequired, false);
  assert.equal(ok.inspection.resendAuthorized, false);
  assert.equal(ok.inspection.voidedAt, voided.voidedAt);
  assert.equal(ok.inspection.claimAgeSeconds, null);
  const serialized = JSON.stringify(ok);
  for (const value of ["PRIVATE_SUBJECT", "PRIVATE_BODY", "private@example.org", "PRIVATE_ADMIN", "PRIVATE_VOID_REASON"]) {
    assert.equal(serialized.includes(value), false);
  }

  const malformed: Array<Record<string, unknown>> = [
    { voidedAt: undefined }, { voidedAt: null }, { voidedAt: "not-a-date" },
    { voidedBy: " " }, { voidedBy: null }, { voidedBy: undefined },
    { voidReason: "" }, { voidReason: null }, { voidReason: 5 },
    { dispatchAttemptId: "a" }, { dispatchClaimedAt: "2026-10-03T12:01:00.000Z" },
    { provider: "sendgrid" }, { providerMessageId: "m" },
    { providerAcceptedAt: "2026-10-03T12:01:00.000Z" },
    { failedAt: "2026-10-03T12:01:00.000Z" }, { failureCode: "x" }
  ];
  for (const patch of malformed) {
    const r = await inspect({ ...voided, ...patch });
    assert.deepEqual(r, { ok: false, code: "INVALID_DELIVERY_RECORD" }, JSON.stringify(patch));
  }

  console.log("readMinistryEmailDispatchInspectionVoided.test.ts passed");
}

run().catch(error => { console.error(error); process.exit(1); });
