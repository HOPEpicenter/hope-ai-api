import assert from "node:assert/strict";
import type { MinistryCommunicationEvent } from "../../src/domain/communications/phase5CommunicationContracts";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import type { SixWeekFollowupEvent } from "../../src/domain/followups/projectSixWeekVisitorFollowup";
import {
  requestMinistryEmailDelivery,
  type RequestMinistryEmailDeliveryDependencies,
  type RequestMinistryEmailDeliveryInput
} from "../../src/services/communications/requestMinistryEmailDelivery";

const visitorId = "visitor-1";
const actorId = "staff-1";
const deliveryId = "delivery-1";
const communicationId = "communication-1";

type SetupOptions = {
  events?: MinistryCommunicationEvent[];
  sixWeekEvents?: SixWeekFollowupEvent[];
  actorStatus?: "active" | "inactive" | null;
  visitor?: { visitorId: string; name: string; email?: string; createdAt: string; updatedAt: string } | null;
  phase5Enabled?: boolean;
  preferenceState?: "granted" | "denied" | "unknown" | null;
};

function intentEvent(overrides: {
  channel?: "email" | "phone_call";
  context?: "care" | "formation" | "six_week_followup" | "person_360";
  relatedFollowupPlanId?: string | null;
  cancelled?: boolean;
} = {}): MinistryCommunicationEvent[] {
  const channel = overrides.channel ?? "email";
  const events: MinistryCommunicationEvent[] = [
    {
      eventId: "intent-event",
      visitorId,
      type: "ministry_communication.intent_recorded",
      occurredAt: "2026-10-03T12:00:00.000Z",
      actorId,
      data: {
        communicationId,
        visitorId,
        channel,
        intent: "follow_up",
        requestedAt: "2026-10-03T12:00:00.000Z",
        requestedBy: actorId,
        context: overrides.context ?? "six_week_followup",
        relatedFollowupPlanId: overrides.relatedFollowupPlanId ?? null,
        notes: null
      }
    },
    {
      eventId: "preference-event",
      visitorId,
      type: "ministry_communication.preference_recorded",
      occurredAt: "2026-10-03T12:00:00.000Z",
      actorId,
      data: {
        visitorId,
        channel: "email",
        state: "granted",
        recordedAt: "2026-10-03T12:00:00.000Z",
        recordedBy: actorId
      }
    }
  ];

  if (overrides.cancelled) {
    events.push({
      eventId: "cancel-event",
      visitorId,
      type: "ministry_communication.cancelled",
      occurredAt: "2026-10-03T12:01:00.000Z",
      actorId,
      data: { communicationId, reason: "Cancelled" }
    });
  }

  return events;
}

function sixWeekEvents(contactConsent = true): SixWeekFollowupEvent[] {
  return [{
    eventId: "six-week-start",
    visitorId,
    type: "six_week_followup.plan_started",
    occurredAt: "2026-10-01T12:00:00.000Z",
    actorId,
    data: {
      firstVisitDate: "2026-10-01",
      ownerStaffId: null,
      contactConsent,
      preferredContactMethod: "email"
    }
  }];
}

function setup(options: SetupOptions = {}) {
  let communicationEvents = options.events ?? intentEvent();
  if (options.preferenceState !== undefined) {
    if (options.preferenceState === null) {
      communicationEvents = communicationEvents.filter(
        event => event.type !== "ministry_communication.preference_recorded"
      );
    }
    for (const event of communicationEvents) {
      if (
        event.type === "ministry_communication.preference_recorded" &&
        "state" in event.data &&
        options.preferenceState
      ) {
        event.data.state = options.preferenceState;
      }
    }
  }

  return setupDependencies(options, communicationEvents);
}

function setupDependencies(
  options: SetupOptions,
  communicationEvents: MinistryCommunicationEvent[]
) {
  const stored = new Map<string, MinistryEmailDeliveryRecord>();
  const sixWeek = options.sixWeekEvents ?? sixWeekEvents();
  const input: RequestMinistryEmailDeliveryInput = {
    visitorId,
    actorId,
    deliveryId,
    communicationId,
    subject: "  Approved subject  ",
    body: "Approved plain-text body\nKeep exact formatting."
  };
  const dependencies: RequestMinistryEmailDeliveryDependencies = {
    phase5Enabled: () => options.phase5Enabled ?? true,
    now: () => "2026-10-03T12:05:00.000Z",
    readActor: async id =>
      options.actorStatus === null || id !== actorId
        ? null
        : { staffId: id, status: options.actorStatus ?? "active" },
    getVisitor: async id =>
      options.visitor === null
        ? null
        : options.visitor ?? {
          visitorId: id,
          name: "Visitor",
          email: "  Canonical@Example.org ",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
    communicationRepository: {
      listByVisitor: async id => communicationEvents.filter(event => event.visitorId === id)
    },
    sixWeekRepository: {
      listByVisitor: async id => sixWeek.filter(event => event.visitorId === id)
    },
    deliveriesRepository: {
      getById: async id => stored.get(id) ?? null,
      create: async record => {
        const key = record.deliveryId;
        if (stored.has(key)) return false;
        stored.set(key, record);
        return true;
      }
    }
  };

  return {
    input,
    dependencies,
    stored,
    sixWeek,
    getCommunicationEvents: () => communicationEvents,
  };
}

async function run(): Promise<void> {
  for (const actorStatus of [null, "inactive"] as const) {
    const fixture = setup({ actorStatus });
    const result = await requestMinistryEmailDelivery(fixture.input, fixture.dependencies);
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 403);
  }

  for (const input of [
    { visitorId: "" },
    { actorId: "" },
    { deliveryId: "" },
    { communicationId: "" },
    { subject: "  " },
    { body: " \n " },
    { subject: "x".repeat(201) },
    { body: "x".repeat(10001) }
  ]) {
    const fixture = setup();
    const result = await requestMinistryEmailDelivery(
      { ...fixture.input, ...input },
      fixture.dependencies
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 400);
  }

  const missingVisitor = setup({ visitor: null });
  const visitorMissingResult = await requestMinistryEmailDelivery(missingVisitor.input, missingVisitor.dependencies);
  assert.equal(visitorMissingResult.accepted, false);
  if (!visitorMissingResult.accepted) assert.equal(visitorMissingResult.status, 404);

  for (const email of [undefined, "", "   "]) {
    const fixture = setup({
      visitor: {
        visitorId,
        name: "Visitor",
        ...(email === undefined ? {} : { email }),
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    });
    const result = await requestMinistryEmailDelivery(fixture.input, fixture.dependencies);
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 409);
  }

  const missingCommunication = setup({ events: [] });
  const missingCommunicationResult = await requestMinistryEmailDelivery(missingCommunication.input, missingCommunication.dependencies);
  assert.equal(missingCommunicationResult.accepted, false);
  if (!missingCommunicationResult.accepted) assert.equal(missingCommunicationResult.status, 404);

  for (const overrides of [
    { channel: "phone_call" as const },
    { cancelled: true }
  ]) {
    const fixture = setup({ events: intentEvent(overrides) });
    const result = await requestMinistryEmailDelivery(fixture.input, fixture.dependencies);
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 409);
  }

  for (const preferenceState of ["unknown", "denied", null] as const) {
    const fixture = setup({ preferenceState });
    const result = await requestMinistryEmailDelivery(fixture.input, fixture.dependencies);
    assert.equal(result.accepted, false, `preference state ${preferenceState} must block`);
    if (!result.accepted) assert.equal(result.status, 409);
  }

  const missingPlan = setup({ sixWeekEvents: [] });
  const noPlanResult = await requestMinistryEmailDelivery(missingPlan.input, missingPlan.dependencies);
  assert.equal(noPlanResult.accepted, false);
  if (!noPlanResult.accepted) assert.equal(noPlanResult.status, 409);

  const consentFalse = setup({ sixWeekEvents: sixWeekEvents(false) });
  const consentFalseResult = await requestMinistryEmailDelivery(consentFalse.input, consentFalse.dependencies);
  assert.equal(consentFalseResult.accepted, false);

  const mismatch = setup({
    events: intentEvent({ relatedFollowupPlanId: "different-plan" })
  });
  const mismatchResult = await requestMinistryEmailDelivery(mismatch.input, mismatch.dependencies);
  assert.equal(mismatchResult.accepted, false);
  if (!mismatchResult.accepted) assert.equal(mismatchResult.status, 409);

  const person360 = setup({ events: intentEvent({ context: "person_360" }) });
  const person360Result = await requestMinistryEmailDelivery(person360.input, person360.dependencies);
  assert.equal(person360Result.accepted, false);
  if (!person360Result.accepted) assert.equal(person360Result.status, 409);

  const featureDisabled = setup({ phase5Enabled: false });
  const disabledResult = await requestMinistryEmailDelivery(featureDisabled.input, featureDisabled.dependencies);
  assert.equal(disabledResult.accepted, false);
  if (!disabledResult.accepted) assert.equal(disabledResult.status, 503);

  const valid = setup({
    events: intentEvent({ relatedFollowupPlanId: "six-week-followup:visitor-1" })
  });
  const sixWeekBeforeRequest = structuredClone(valid.sixWeek);
  const clientWithUnauthorizedEmail = Object.assign({}, valid.input, {
    recipientEmail: "attacker@example.net"
  });
  const first = await requestMinistryEmailDelivery(clientWithUnauthorizedEmail, valid.dependencies);
  assert.equal(first.accepted, true);
  if (!first.accepted) throw new Error("Expected an eligible email delivery request.");
  assert.equal(first.status, 201);
  assert.equal(first.created, true);
  assert.equal(first.delivery.state, "requested");
  assert.equal(first.delivery.dispatchAttemptId, null);
  assert.equal(first.delivery.dispatchClaimedAt, null);
  assert.equal(first.delivery.recipientEmail, "canonical@example.org");
  assert.equal(first.delivery.subject, valid.input.subject);
  assert.equal(first.delivery.body, valid.input.body);
  assert.deepEqual(first.delivery.eligibility, {
    phase5Enabled: true,
    contactConsent: true,
    emailPreference: "granted"
  });
  assert.equal(first.delivery.provider, null);
  assert.equal(first.delivery.providerMessageId, null);
  assert.equal(first.delivery.providerAcceptedAt, null);
  assert.equal(first.delivery.failedAt, null);
  assert.equal(first.delivery.failureCode, null);
  assert.equal(valid.getCommunicationEvents().some(event =>
    event.type === "ministry_communication.outcome_recorded"
  ), false);
  assert.deepEqual(valid.sixWeek, sixWeekBeforeRequest);

  valid.getCommunicationEvents().push({
    eventId: "later-cancel-event",
    visitorId,
    type: "ministry_communication.cancelled",
    occurredAt: "2026-10-03T12:06:00.000Z",
    actorId,
    data: { communicationId, reason: "Cancelled after request" }
  });
  for (const event of valid.getCommunicationEvents()) {
    if (
      event.type === "ministry_communication.preference_recorded" &&
      "state" in event.data
    ) {
      event.data.state = "denied";
    }
  }
  const replay = await requestMinistryEmailDelivery(valid.input, valid.dependencies);
  assert.equal(replay.accepted, true);
  if (!replay.accepted) throw new Error("Expected delivery request replay.");
  assert.equal(replay.status, 200);
  assert.equal(replay.created, false);
  assert.deepEqual(replay.delivery, first.delivery);

  const conflict = await requestMinistryEmailDelivery({
    ...valid.input,
    body: "Different approved content"
  }, valid.dependencies);
  assert.equal(conflict.accepted, false);
  if (!conflict.accepted) assert.equal(conflict.status, 409);

  const care = setup({ events: intentEvent({ context: "care" }) });
  const careResult = await requestMinistryEmailDelivery(care.input, care.dependencies);
  assert.equal(careResult.accepted, false);

  const formation = setup({ events: intentEvent({ context: "formation" }) });
  const formationResult = await requestMinistryEmailDelivery(formation.input, formation.dependencies);
  assert.equal(formationResult.accepted, false);

  console.log("requestMinistryEmailDelivery.test.ts passed");
}

run();
