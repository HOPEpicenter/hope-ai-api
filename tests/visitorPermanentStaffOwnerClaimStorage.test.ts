import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { TransactionAction } from "@azure/data-tables";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";
import { createPermanentVisitorConsentRepository } from "../src/repositories/permanentVisitorConsentRepository";
import { SixWeekFollowupEventsRepository } from "../src/repositories/sixWeekFollowupEventsRepository";
import { assignSixWeekFollowupOwner, recordSixWeekTaskOutcome } from "../src/services/followups/sixWeekVisitorFollowupCommands";
import {
  PUBLIC_VISITOR_SYSTEM_ORIGIN,
  projectSixWeekVisitorFollowup,
  type SixWeekFollowupEvent
} from "../src/domain/followups/projectSixWeekVisitorFollowup";

const visitorId = "synthetic-148h11-visitor";
const submissionId = "synthetic-148h11-registration";
const visitDate = "2026-11-24";
const stamp = "2026-11-24T12:00:00.000Z";
const later = "2026-11-24T13:00:00.000Z";

for (const scenario of [
  "authorized_claim",
  "competing_claims",
  "withdrawal_race",
  "cancellation_race",
  "task_without_contact",
  "task_withdrawal_race",
  "task_contact_remains_held"
] as const) {
  test(`atomic Staff owner claim: ${scenario}`, async () => {
    const table = createIsolatedVisitorTestTable("VisitorFollowupEvents");

    const savedFlag = process.env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY;
    const savedCutover = process.env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER;

    process.env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY = "true";
    process.env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER = stamp;

    try {
      await table.createTable();

      try {
        const authority = createPermanentVisitorConsentRepository(table, true);
        const repository = new SixWeekFollowupEventsRepository(table);

        assert.equal((await authority.apply(visitorId, {
          kind: "new_profile",
          evidenceId: submissionId,
          initialConsent: true
        })).status, "committed");

        const planEvent: SixWeekFollowupEvent = {
          visitorId,
          eventId: `evt-public-${submissionId}`,
          type: "six_week_followup.plan_started",
          occurredAt: stamp,
          actorId: PUBLIC_VISITOR_SYSTEM_ORIGIN,
          data: {
            firstVisitDate: visitDate,
            ownerStaffId: null,
            contactConsent: true,
            preferredContactMethod: null
          }
        };

        assert.equal(await authority.appendPublicEnrollment({
          visitorId, submissionId, visitDate,
          serviceId: `visit-${visitDate}`
        }, planEvent), "enrolled");

        function claim(actorId: string, active = true) {
          return assignSixWeekFollowupOwner({
            visitorId, actorId, ownerStaffId: actorId
          }, {
            repository,
            now: () => later,
            newEventId: () => `claim-${actorId}`,
            readActor: async id => ({
              staffId: id,
              status: active ? "active" : "inactive"
            }),
            readAssignee: async id => ({
              staffId: id,
              status: "active"
            })
          });
        }

        const ownerEvent: SixWeekFollowupEvent = {
          visitorId,
          eventId: "synthetic-owner-claim",
          type: "six_week_followup.owner_assigned",
          actorId: "synthetic-staff-a",
          occurredAt: later,
          data: { ownerStaffId: "synthetic-staff-a" }
        };

        if (scenario === "authorized_claim") {
          const inactive = await claim("synthetic-inactive", false);
          assert.equal(inactive.accepted, false);

          const result = await claim("synthetic-staff-a");

          assert.equal(result.accepted, true);
          if (result.accepted) {
            assert.equal(result.plan.ownerStaffId, "synthetic-staff-a");
          }

          const second = await claim("synthetic-staff-b");
          assert.equal(second.accepted, false);

          const events = await repository.listByVisitor(visitorId);
          assert.equal(events.filter(e =>
            e.type === "six_week_followup.owner_assigned"
          ).length, 1);

        } else if (
          scenario === "task_without_contact" ||
          scenario === "task_withdrawal_race" ||
          scenario === "task_contact_remains_held"
        ) {
          const actorId = "synthetic-staff-a";

          assert.equal((await claim(actorId)).accepted, true);

          const taskStamp = "2026-11-24T14:00:00.000Z";
          let careWrites = 0;

          function recordTask(
            weekNumber: number,
            contactMethod: "none" | "call",
            actor = actorId,
            disposition: "completed" | "skipped" = "completed"
          ) {
            return recordSixWeekTaskOutcome({
              visitorId,
              actorId: actor,
              weekNumber,
              disposition,
              contactMethod,
              outcome: "Synthetic outcome",
              notes: null
            }, {
              repository,
              now: () => taskStamp,
              newEventId: () => `synthetic-task-${weekNumber}`,
              readActor: async id => ({
                staffId: id,
                status: "active"
              }),
              recordCareEvent: async () => {
                careWrites++;
                throw Error("Unexpected Care contact write");
              }
            });
          }

          if (scenario === "task_without_contact") {
            const unauthorized = await recordTask(
              1, "none", "synthetic-staff-b"
            );

            assert.equal(unauthorized.accepted, false);

            const first = await recordTask(1, "none");
            assert.equal(first.accepted, true);

            if (first.accepted) {
              assert.equal(first.plan.tasks[0].status, "completed");
            }

            const replay = await recordTask(1, "none");
            assert.equal(replay.accepted, true);

            if (replay.accepted) {
              assert.equal(replay.created, false);
            }

            const second = await recordTask(
              2, "none", actorId, "skipped"
            );

            assert.equal(second.accepted, true);

            if (second.accepted) {
              assert.equal(second.plan.tasks[1].status, "skipped");
            }

            const events = await repository.listByVisitor(visitorId);

            assert.equal(events.filter(e =>
              e.type === "six_week_followup.task_completed" ||
              e.type === "six_week_followup.task_skipped"
            ).length, 2);

          } else if (scenario === "task_contact_remains_held") {
            const result = await recordTask(1, "call");

            assert.equal(result.accepted, false);

            const events = await repository.listByVisitor(visitorId);
            assert.equal(events.filter(e =>
              e.type === "six_week_followup.task_completed"
            ).length, 0);

          } else {
            let injected = false;

            const racingAuthority =
              createPermanentVisitorConsentRepository({
                getEntity: table.getEntity.bind(table),
                listEntities: table.listEntities.bind(table),
                submitTransaction: async (actions: TransactionAction[]) => {
                  assert.equal(injected, false);
                  injected = true;

                  assert.equal((await authority.apply(visitorId, {
                    kind: "public_request",
                    requestId: "task-race-withdrawal",
                    expectedRevision: 1,
                    requestedConsent: false
                  })).status, "committed");

                  return table.submitTransaction(actions);
                }
              }, true);

            const result =
              await racingAuthority.appendStaffTaskWithoutContact({
                visitorId,
                actorId,
                eventId: "synthetic-racing-task",
                occurredAt: taskStamp,
                type: "six_week_followup.task_completed",
                data: {
                  weekNumber: 1,
                  contactMethod: "none",
                  outcome: "Synthetic outcome",
                  careOutcome: null,
                  notes: null
                }
              });

            assert.equal(injected, true);
            assert.notEqual(result, "recorded");

            const denied = await recordTask(1, "none");
            assert.equal(denied.accepted, false);

            const events = await repository.listByVisitor(visitorId);
            assert.equal(events.filter(e =>
              e.type === "six_week_followup.task_completed"
            ).length, 0);
          }

          assert.equal(careWrites, 0);

        } else if (scenario === "competing_claims") {
          const results = await Promise.all([
            claim("synthetic-staff-a"),
            claim("synthetic-staff-b")
          ]);

          assert.equal(results.filter(r => r.accepted).length, 1);

          const events = await repository.listByVisitor(visitorId);
          assert.equal(events.filter(e =>
            e.type === "six_week_followup.owner_assigned"
          ).length, 1);

        } else {
          let raceInjected = false;

          const racingAuthority = createPermanentVisitorConsentRepository({
            getEntity: table.getEntity.bind(table),
            listEntities: table.listEntities.bind(table),
            submitTransaction: async (actions: TransactionAction[]) => {
              assert.equal(raceInjected, false);
              raceInjected = true;

              if (scenario === "withdrawal_race") {
                assert.equal((await authority.apply(visitorId, {
                  kind: "public_request",
                  requestId: "synthetic-withdrawal",
                  expectedRevision: 1,
                  requestedConsent: false
                })).status, "committed");
              } else {
                assert.equal(await repository.append({
                  visitorId,
                  eventId: "synthetic-cancellation",
                  type: "six_week_followup.plan_cancelled",
                  occurredAt: "2026-11-24T12:30:00.000Z",
                  actorId: "synthetic-staff-a",
                  data: { reason: "synthetic cancellation" }
                }), true);
              }

              return table.submitTransaction(actions);
            }
          }, true);

          const result = await racingAuthority.appendStaffOwnerClaim(ownerEvent);

          assert.equal(raceInjected, true);
          assert.notEqual(result, "claimed");

          const events = await repository.listByVisitor(visitorId);

          assert.equal(events.filter(e =>
            e.type === "six_week_followup.owner_assigned"
          ).length, 0);

          if (scenario === "cancellation_race") {
            assert.equal(
              projectSixWeekVisitorFollowup(events)?.status,
              "cancelled"
            );
          }

          if (scenario === "withdrawal_race") {
            const denied = await claim("synthetic-staff-a");
            assert.equal(denied.accepted, false);
          }
        }

        // The ordinary uncoordinated contact writer is still held.
        await assert.rejects(repository.append(ownerEvent));

      } finally {
        await table.deleteTable();
      }
    } finally {
      if (savedFlag === undefined) {
        delete process.env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY;
      } else {
        process.env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY = savedFlag;
      }

      if (savedCutover === undefined) {
        delete process.env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER;
      } else {
        process.env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER = savedCutover;
      }
    }
  });
}