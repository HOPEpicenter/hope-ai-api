import assert from "node:assert/strict";
import {
  projectMinistryCommunications
} from "../../src/domain/communications/projectMinistryCommunications";
import type {
  MinistryCommunicationEvent
} from "../../src/domain/communications/phase5CommunicationContracts";

const visitorId = "visitor-1";

function event(
  eventId: string,
  occurredAt: string,
  type: MinistryCommunicationEvent["type"],
  data: MinistryCommunicationEvent["data"]
): MinistryCommunicationEvent {
  return {
    eventId,
    visitorId,
    type,
    occurredAt,
    actorId: "staff-1",
    data
  };
}

function run(): void {
  const projection = projectMinistryCommunications(visitorId, [
    event(
      "outcome-after-cancel",
      "2026-08-27T10:05:00.000Z",
      "ministry_communication.outcome_recorded",
      {
        communicationId: "communication-1",
        visitorId,
        channel: "email",
        outcome: "sent",
        occurredAt: "2026-08-27T10:05:00.000Z",
        recordedBy: "staff-1",
        notes: "Must not replace cancellation."
      }
    ),
    event(
      "preference-granted",
      "2026-08-27T09:00:00.000Z",
      "ministry_communication.preference_recorded",
      {
        visitorId,
        channel: "email",
        state: "granted",
        recordedAt: "2026-08-27T09:00:00.000Z",
        recordedBy: "staff-1"
      }
    ),
    event(
      "intent",
      "2026-08-27T10:00:00.000Z",
      "ministry_communication.intent_recorded",
      {
        communicationId: "communication-1",
        visitorId,
        channel: "email",
        intent: "follow_up",
        requestedAt: "2026-08-27T10:00:00.000Z",
        requestedBy: "staff-1",
        context: "six_week_followup",
        relatedFollowupPlanId: null,
        notes: "Staff-recorded intent only."
      }
    ),
    event(
      "cancel",
      "2026-08-27T10:04:00.000Z",
      "ministry_communication.cancelled",
      {
        communicationId: "communication-1",
        reason: "Visitor asked to defer contact."
      }
    ),
    event(
      "preference-denied",
      "2026-08-27T09:01:00.000Z",
      "ministry_communication.preference_recorded",
      {
        visitorId,
        channel: "email",
        state: "denied",
        recordedAt: "2026-08-27T09:01:00.000Z",
        recordedBy: "staff-2"
      }
    ),
    {
      ...event(
        "other-visitor",
        "2026-08-27T09:02:00.000Z",
        "ministry_communication.preference_recorded",
        {
          visitorId: "visitor-2",
          channel: "phone_call",
          state: "granted",
          recordedAt: "2026-08-27T09:02:00.000Z",
          recordedBy: "staff-1"
        }
      ),
      visitorId: "visitor-2"
    }
  ]);

  assert.equal(projection.schemaVersion, 1);
  assert.deepEqual(projection.preferences, [
    {
      visitorId,
      channel: "email",
      state: "denied",
      recordedAt: "2026-08-27T09:01:00.000Z",
      recordedBy: "staff-2"
    }
  ]);
  assert.equal(projection.items.length, 1);
  assert.equal(projection.items[0].outcome, null);
  assert.equal(projection.items[0].cancelledAt, "2026-08-27T10:04:00.000Z");
  assert.equal(
    projection.items[0].cancellationReason,
    "Visitor asked to defer contact."
  );

  console.log("projectMinistryCommunications.test.ts passed");
}

run();
