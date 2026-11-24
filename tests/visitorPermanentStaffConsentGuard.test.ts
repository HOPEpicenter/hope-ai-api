import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  assignSixWeekFollowupOwner,
  recordSixWeekTaskOutcome,
  changeSixWeekFollowupStatus,
  type SixWeekFollowupCommandDependencies
} from "../src/services/followups/sixWeekVisitorFollowupCommands";

import type {
  SixWeekFollowupEvent
} from "../src/domain/followups/projectSixWeekVisitorFollowup";

import type {
  RegistrationConsent
} from "../src/services/followups/readLatestRegistrationConsent";

const FLAG =
  "FEATURE_PERMANENT_VISITOR_CONSENT_GUARD";

process.env[FLAG] = "true";

const visitorId = "synthetic-consent-visitor";
const actorId = "synthetic-authorized-staff";

function fixture(
  consent: RegistrationConsent,
  options: {
    paused?: boolean;
    unassigned?: boolean;
    inactive?: boolean;
    throws?: boolean;
  } = {}
) {
  const events: SixWeekFollowupEvent[] = [
    {
      eventId: "evt-synthetic-start",
      visitorId,
      type: "six_week_followup.plan_started",
      occurredAt: "2026-11-24T18:00:00.000Z",
      actorId,
      data: {
        firstVisitDate: "2026-11-24",
        ownerStaffId: options.unassigned
          ? null : actorId,
        contactConsent: true
      }
    }
  ];

  if (options.paused) {
    events.push({
      eventId: "evt-synthetic-pause",
      visitorId,
      type: "six_week_followup.plan_paused",
      occurredAt: "2026-11-24T19:00:00.000Z",
      actorId,
      data: { reason: "Synthetic pause" }
    });
  }

  let reads = 0;
  let writes = 0;

  const deps: SixWeekFollowupCommandDependencies = {
    now: () => "2026-11-24T20:00:00.000Z",

    newEventId: () => "evt-synthetic-new",

    readActor: async id => ({
      staffId: id,
      status: options.inactive
        ? "inactive" : "active"
    }),

    readAssignee: async id => ({
      staffId: id,
      status: "active"
    }),

    readRegistrationConsent: async id => {
      assert.equal(id, visitorId);
      reads++;

      if (options.throws) {
        throw new Error("Synthetic storage failure");
      }

      return consent;
    },

    repository: {
      async listByVisitor(id) {
        return events.filter(event =>
          event.visitorId === id
        );
      },

      async append(event) {
        writes++;
        events.push(event);
        return true;
      }
    }
  };

  return {
    deps,
    reads: () => reads,
    writes: () => writes
  };
}

const task = {
  visitorId,
  actorId,
  weekNumber: 1,
  disposition: "completed" as const,
  contactMethod: "call" as const,
  outcome: "Synthetic task outcome"
};

test("durable decline blocks assignment, resume and new task outcomes before event append", async () => {
  const assignment = fixture(
    "declined",
    { unassigned: true }
  );

  const assign =
    await assignSixWeekFollowupOwner({
      visitorId,
      actorId,
      ownerStaffId: actorId
    }, assignment.deps);

  assert.equal(assign.accepted, false);
  assert.equal(assign.status, 409);
  assert.equal(assignment.writes(), 0);

  const paused = fixture(
    "declined",
    { paused: true }
  );

  const resume =
    await changeSixWeekFollowupStatus({
      visitorId,
      actorId,
      action: "resume"
    }, paused.deps);

  assert.equal(resume.accepted, false);
  assert.equal(resume.status, 409);
  assert.equal(paused.writes(), 0);

  const active = fixture("declined");

  const completed = await recordSixWeekTaskOutcome(
    task, active.deps
  );

  assert.equal(completed.accepted, false);
  assert.equal(completed.status, 409);
  assert.equal(active.writes(), 0);
});

test("administrative override cannot bypass durable consent withdrawal", async () => {
  const f = fixture("declined");

  const result = await recordSixWeekTaskOutcome({
    ...task,
    administrativeOverrideVerified: true
  }, f.deps);

  assert.equal(result.accepted, false);
  assert.equal(result.status, 409);
  assert.equal(f.writes(), 0);
});

test("unavailable consent and storage exceptions fail closed", async () => {
  for (const f of [
    fixture("unavailable"),
    fixture("granted", { throws: true })
  ]) {
    const result =
      await recordSixWeekTaskOutcome(
        task, f.deps
      );

    assert.equal(result.accepted, false);
    assert.equal(result.status, 503);
    assert.equal(f.writes(), 0);
  }
});

test("granted consent and legacy records preserve authorized resume workflow", async () => {
  for (const consent of [
    "granted",
    "legacy_no_evidence"
  ] as const) {
    const f = fixture(
      consent, { paused: true }
    );

    const result =
      await changeSixWeekFollowupStatus({
        visitorId,
        actorId,
        action: "resume"
      }, f.deps);

    assert.equal(result.accepted, true);
    assert.equal(f.writes(), 1);
    assert.equal(f.reads(), 1);
  }
});

test("declined consent does not block authorized pause or cancellation", async () => {
  for (const action of [
    "pause", "cancel"
  ] as const) {
    const f = fixture("declined");

    const result =
      await changeSixWeekFollowupStatus({
        visitorId,
        actorId,
        action,
        reason: "Synthetic consent reconciliation"
      }, f.deps);

    assert.equal(result.accepted, true);
    assert.equal(f.writes(), 1);
    assert.equal(f.reads(), 0);
  }
});

test("consent guard never replaces existing active Staff authorization", async () => {
  const f = fixture(
    "granted",
    { inactive: true }
  );

  const result = await recordSixWeekTaskOutcome(
    task, f.deps
  );

  assert.equal(result.accepted, false);
  assert.equal(f.writes(), 0);
  assert.equal(f.reads(), 0);
});

test("default-off rollout preserves existing command behavior", async () => {
  const previous = process.env[FLAG];

  try {
    delete process.env[FLAG];

    const f = fixture(
      "declined",
      { paused: true }
    );

    const result =
      await changeSixWeekFollowupStatus({
        visitorId,
        actorId,
        action: "resume"
      }, f.deps);

    assert.equal(result.accepted, true);
    assert.equal(f.reads(), 0);
    assert.equal(f.writes(), 1);
  } finally {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  }
});
