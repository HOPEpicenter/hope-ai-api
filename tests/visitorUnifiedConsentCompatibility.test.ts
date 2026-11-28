import { test } from "node:test";
import assert from "node:assert/strict";

import {
  changeSixWeekFollowupStatus
} from "../src/services/followups/sixWeekVisitorFollowupCommands";

import type {
  SixWeekFollowupEvent
} from "../src/domain/followups/projectSixWeekVisitorFollowup";

import type {
  RegistrationConsent
} from "../src/services/followups/readLatestRegistrationConsent";

const actorId = "synthetic-authorized-staff";
const visitorId = "synthetic-unified-visitor";
const publicOrigin = "system:permanent-visitor-registration";

process.env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY = "true";

async function resume(
  startedBy: string,
  consent: RegistrationConsent
) {
  const events: SixWeekFollowupEvent[] = [
    {
      visitorId,
      eventId: "synthetic-plan-start",
      type: "six_week_followup.plan_started",
      occurredAt: "2026-11-24T12:00:00.000Z",
      actorId: startedBy,
      data: {
        firstVisitDate: "2026-11-24",
        ownerStaffId: actorId,
        contactConsent: true,
        preferredContactMethod: null
      }
    },
    {
      visitorId,
      eventId: "synthetic-plan-pause",
      type: "six_week_followup.plan_paused",
      occurredAt: "2026-11-24T13:00:00.000Z",
      actorId,
      data: { reason: "Synthetic pause" }
    }
  ];

  let coordinatedWrites = 0;

  const result = await changeSixWeekFollowupStatus({
    visitorId,
    actorId,
    action: "resume",
    reason: null
  }, {
    readActor: async id => ({
      staffId: id,
      status: "active"
    }),
    readRegistrationConsent: async () => consent,
    now: () => "2026-11-24T14:00:00.000Z",
    newEventId: () => "synthetic-resume",
    repository: {
      listByVisitor: async () => [...events],
      append: async () => {
        throw new Error("Uncoordinated writer forbidden");
      },
      resumeConsentProtectedPlan: async event => {
        coordinatedWrites++;
        events.push(event);
        return "recorded";
      }
    }
  });

  return { result, coordinatedWrites };
}

test("public plan with verified consent uses coordinated resume", async () => {
  const r = await resume(publicOrigin, "granted");

  assert.equal(r.result.accepted, true);
  assert.equal(r.coordinatedWrites, 1);
});

test("declined, unknown or pending consent prevents resume", async () => {
  for (const origin of [actorId, publicOrigin]) {
    for (const consent of [
      "declined",
      "unavailable",
      "pending_verification",
      "legacy_no_evidence"
    ] as const) {
      const r = await resume(origin, consent);

      assert.equal(r.result.accepted, false);
      assert.equal(r.coordinatedWrites, 0);
    }
  }

  console.log("CONSENT_DENIAL_PROTECTION_VERIFIED=True");
});

test("Staff-created plan with verified consent requires coordinated compatibility", async () => {
  const r = await resume(actorId, "granted");

  console.log(
    "LEGACY_VERIFIED_CONSENT_RESUME_ACCEPTED=" +
    r.result.accepted
  );

  assert.equal(r.result.accepted, true);
  assert.equal(r.coordinatedWrites, 1);
});
