import assert from "node:assert/strict";
import {
  MINISTRY_COMMUNICATION_SCHEMA_VERSION,
  type MinistryCommunicationRecord
} from "../../src/domain/communications/phase5CommunicationContracts";
import { getFeatureFlags } from "../../src/config/featureFlags";

function run(): void {
  const original = process.env.FEATURE_PHASE5_COMMUNICATIONS;

  try {
    delete process.env.FEATURE_PHASE5_COMMUNICATIONS;
    assert.equal(getFeatureFlags().phase5Communications, false);

    process.env.FEATURE_PHASE5_COMMUNICATIONS = "true";
    assert.equal(getFeatureFlags().phase5Communications, true);

    const record: MinistryCommunicationRecord = {
      schemaVersion: MINISTRY_COMMUNICATION_SCHEMA_VERSION,
      communicationId: "communication-1",
      visitorId: "visitor-1",
      channel: "email",
      intent: "follow_up",
      requestedAt: "2026-08-27T00:00:00.000Z",
      requestedBy: "staff-1",
      outcome: null,
      outcomeAt: null,
      outcomeRecordedBy: null,
      context: "six_week_followup",
      relatedFollowupPlanId: null,
      notes: null,
      cancelledAt: null,
      cancellationReason: null
    };

    assert.equal(record.schemaVersion, 1);
    assert.equal(record.outcome, null);
  } finally {
    if (original === undefined) {
      delete process.env.FEATURE_PHASE5_COMMUNICATIONS;
    } else {
      process.env.FEATURE_PHASE5_COMMUNICATIONS = original;
    }
  }

  console.log("phase5CommunicationContracts.test.ts passed");
}

run();
