import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TransactionAction } from "@azure/data-tables";

import {
  createIsolatedVisitorTestTable
} from "./permanentVisitorIsolatedTestTable";

import {
  createPermanentVisitorConsentRepository
} from "../src/repositories/permanentVisitorConsentRepository";

import {
  SixWeekFollowupEventsRepository,
  toSixWeekFollowupEventEntity
} from "../src/repositories/sixWeekFollowupEventsRepository";

import {
  changeSixWeekFollowupStatus
} from "../src/services/followups/sixWeekVisitorFollowupCommands";

import {
  projectSixWeekVisitorFollowup
} from "../src/domain/followups/projectSixWeekVisitorFollowup";

import {
  readLatestRegistrationConsent
} from "../src/services/followups/readLatestRegistrationConsent";

const actorId = "synthetic-staff-owner";
const stamp = "2026-11-24T12:00:00.000Z";

const table = createIsolatedVisitorTestTable(
  "VisitorFollowupEvents"
);

test.before(async () => {
  await table.createTable();
});

test.after(async () => {
  await table.deleteTable();
});

for (const scenario of [
  "verified_grant",
  "missing_authority",
  "verified_decline",
  "wrong_owner",
  "concurrent_withdrawal"
] as const) {
  test(`existing Staff plan: ${scenario}`, async () => {
    const visitorId = randomUUID();
    const repository =
      new SixWeekFollowupEventsRepository(table);

    const authority =
      createPermanentVisitorConsentRepository(table, true);

    // Seed historical Staff events in disposable storage.
    await table.createEntity(
      toSixWeekFollowupEventEntity({
        visitorId,
        eventId: randomUUID(),
        type: "six_week_followup.plan_started",
        occurredAt: stamp,
        actorId,
        data: {
          firstVisitDate: "2026-11-24",
          ownerStaffId: actorId,
          contactConsent: true,
          preferredContactMethod: null
        }
      })
    );

    await table.createEntity(
      toSixWeekFollowupEventEntity({
        visitorId,
        eventId: randomUUID(),
        type: "six_week_followup.plan_paused",
        occurredAt: "2026-11-24T13:00:00.000Z",
        actorId,
        data: { reason: "Synthetic pause" }
      })
    );

    if (scenario !== "missing_authority") {
      assert.equal((await authority.apply(visitorId, {
        kind: "existing_profile",
        evidenceId: randomUUID()
      })).status, "committed");

      const requestId = randomUUID();

      assert.equal((await authority.apply(visitorId, {
        kind: "public_request",
        expectedRevision: 1,
        requestId,
        requestedConsent: true
      })).status, "committed");

      assert.equal((await authority.apply(visitorId, {
        kind: "verified_staff_decision",
        expectedRevision: 2,
        decisionId: randomUUID(),
        pendingRequestId: requestId,
        actorId,
        decision: scenario === "verified_decline"
          ? "declined" : "granted"
      })).status, "committed");
    }

    let withdrawalInjected = false;

    const racingAuthority =
      createPermanentVisitorConsentRepository({
        getEntity: table.getEntity.bind(table),
        listEntities: table.listEntities.bind(table),
        submitTransaction: async (
          actions: TransactionAction[]
        ) => {
          assert.equal(withdrawalInjected, false);
          withdrawalInjected = true;

          assert.equal((await authority.apply(visitorId, {
            kind: "public_request",
            expectedRevision: 3,
            requestId: randomUUID(),
            requestedConsent: false
          })).status, "committed");

          return table.submitTransaction(actions);
        }
      }, true);

    const result = await changeSixWeekFollowupStatus({
      visitorId,
      actorId: scenario === "wrong_owner"
        ? "synthetic-other-staff" : actorId,
      action: "resume",
      reason: null
    }, {
      repository: {
        listByVisitor: repository.listByVisitor.bind(repository),
        append: repository.append.bind(repository),
        resumeConsentProtectedPlan:
          scenario === "concurrent_withdrawal"
            ? racingAuthority.appendStaffPlanResume
            : repository.resumeConsentProtectedPlan.bind(repository)
      },
      readActor: async id => ({
        staffId: id,
        status: "active"
      }),
      now: () => "2026-11-24T14:00:00.000Z",
      newEventId: randomUUID
    });

    const allowed = scenario === "verified_grant";

    assert.equal(result.accepted, allowed);

    const events = await repository.listByVisitor(visitorId);

    assert.equal(events.filter(event =>
      event.type === "six_week_followup.plan_resumed"
    ).length, allowed ? 1 : 0);

    const plan = projectSixWeekVisitorFollowup(events);

    assert.equal(plan?.status, allowed ? "active" : "paused");

    if (scenario === "concurrent_withdrawal") {
      assert.equal(withdrawalInjected, true);

      assert.equal(
        await readLatestRegistrationConsent(visitorId),
        "pending_verification"
      );
    }
  });
}
