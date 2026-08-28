import assert from "node:assert/strict";
import type { MinistryCommunicationEvent } from "../../src/domain/communications/phase5CommunicationContracts";
import {
  recordMinistryCommunicationIntent,
  recordMinistryCommunicationPreference,
  recordMinistryCommunicationOutcome
} from "../../src/services/communications/ministryCommunicationCommands";

async function run(): Promise<void> {
  const events: MinistryCommunicationEvent[] = [];
  let eventNumber = 0;
  const dependencies = {
    repository: {
      append: async (event: MinistryCommunicationEvent) => {
        if (events.some(item => item.eventId === event.eventId)) return false;
        events.push(event);
        return true;
      },
      listByVisitor: async (visitorId: string) =>
        events.filter(event => event.visitorId === visitorId)
    },
    now: () => "2026-08-28T00:00:00.000Z",
    newEventId: () => `event-${++eventNumber}`,
    readActor: async (staffId: string) =>
      staffId === "staff-1" ? { staffId, status: "active" as const } : null
  };

  const denied = await recordMinistryCommunicationIntent({
    visitorId: "visitor-1",
    actorId: "staff-1",
    communicationId: "communication-1",
    channel: "email",
    intent: "follow_up",
    context: "six_week_followup"
  }, dependencies);
  assert.deepEqual(denied, {
    accepted: false,
    status: 409,
    error: "Recorded consent is required for this communication channel"
  });

  const preference = await recordMinistryCommunicationPreference({
    visitorId: "visitor-1",
    actorId: "staff-1",
    channel: "email",
    state: "granted"
  }, dependencies);
  assert.equal(preference.accepted, true);

  const intent = await recordMinistryCommunicationIntent({
    visitorId: "visitor-1",
    actorId: "staff-1",
    communicationId: "communication-1",
    channel: "email",
    intent: "follow_up",
    context: "six_week_followup"
  }, dependencies);
  assert.equal(intent.accepted, true);
  assert.equal(intent.created, true);

  const outcome = await recordMinistryCommunicationOutcome({
    visitorId: "visitor-1",
    actorId: "staff-1",
    communicationId: "communication-1",
    outcome: "connected"
  }, dependencies);
  assert.equal(outcome.accepted, true);
  if (!outcome.accepted) throw new Error("Expected communication outcome.");
  assert.equal(outcome.communication.items[0].outcome, "connected");

  const inactive = await recordMinistryCommunicationPreference({
    visitorId: "visitor-1",
    actorId: "staff-2",
    channel: "email",
    state: "granted"
  }, dependencies);
  assert.deepEqual(inactive, {
    accepted: false,
    status: 403,
    error: "x-hope-staff-actor-id must reference an active canonical Staff identity"
  });

  console.log("ministryCommunicationCommands.test.ts passed");
}

run();
