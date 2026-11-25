import {
  changeSixWeekFollowupStatus as changeStatusForAcceptance
} from "../src/services/followups/sixWeekVisitorFollowupCommands";

import {
  readSixWeekVisitorFollowup,
  readSixWeekVisitorFollowupQueue
} from "../src/services/followups/readSixWeekVisitorFollowups";
import type {
  FunctionVisitor
} from "../src/functions/_shared/visitorsRepository";

import {
  getFormationEventsTableClient,
  getFormationProfilesTableClient,
  getFormationProfileByVisitorId
} from "../src/functions/_shared/formation";
import {
  GlobalTimelineRepository
} from "../src/repositories/globalTimelineRepository";

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
  "task_resume_withdrawal_race",
  "task_withdrawal_race",
  "task_contact_recovery",
  "task_contact_week_six"
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
          (scenario === "task_without_contact" || scenario === "task_resume_withdrawal_race") ||
          scenario === "task_withdrawal_race" ||
          scenario === "task_contact_recovery" ||
          scenario === "task_contact_week_six"
        ) {
          const actorId = "synthetic-staff-a";

          const queueAsOf = "2026-11-24T14:00:00.000Z";

          const changeStatus = (
            action: "pause" | "resume",
            staffId: string = actorId
          ) => changeStatusForAcceptance({
            visitorId,
            actorId: staffId,
            action,
            reason: action === "pause" ? "Synthetic pause" : null
          }, {
            repository,
            readActor: async id => ({
              staffId: id,
              status: "active" as const
            }),
            now: () => action === "pause"
              ? "2026-11-24T13:20:00.000Z"
              : "2026-11-24T13:30:00.000Z",
            newEventId: () => `synthetic-status-${action}`
          });
          let visitorReads = 0;

          const queueDependencies = {
            repository,
            getVisitor: async () => {
              visitorReads++;
              const visitor: FunctionVisitor = {
                visitorId,
                name: "Synthetic visitor",
                email: "synthetic@example.invalid",
                phone: "5550100",
                createdAt: queueAsOf,
                updatedAt: queueAsOf
              };

              return visitor;
            }
          };

          if ((scenario === "task_without_contact" || scenario === "task_resume_withdrawal_race") ||
              scenario === "task_withdrawal_race") {

            const unclaimed = await readSixWeekVisitorFollowup(
              visitorId, queueAsOf, { repository }
            );

            assert.equal(unclaimed?.status, "active");
            assert.equal(
              unclaimed?.staffWorkflow,
              "consent_protected_public"
            );
            assert.equal(unclaimed?.needsOwner, true);

            const queue = await readSixWeekVisitorFollowupQueue(
              queueAsOf, queueDependencies
            );

            assert.equal(queue.count, 1);
            assert.equal(queue.needsOwner, 1);
            assert.equal(queue.items[0].visitorId, visitorId);
            assert.equal(visitorReads, 1);

            console.log("UNCLAIMED_PUBLIC_PLAN_VISIBLE=True");
          }

          assert.equal((await claim(actorId)).accepted, true);

          if ((scenario === "task_without_contact" || scenario === "task_resume_withdrawal_race")) {
            const claimed = await readSixWeekVisitorFollowup(
              visitorId, queueAsOf, { repository }
            );

            assert.equal(claimed?.ownerStaffId, actorId);
            assert.equal(
              claimed?.staffWorkflow,
              "consent_protected_public"
            );
            assert.equal(claimed?.needsOwner, false);

            const queue = await readSixWeekVisitorFollowupQueue(
              queueAsOf, queueDependencies
            );

            assert.equal(queue.count, 1);
            assert.equal(queue.needsOwner, 0);
            assert.equal(queue.items[0].plan.ownerStaffId, actorId);

            console.log("CLAIMED_PUBLIC_PLAN_VISIBLE=True");

            const paused = await changeStatus("pause");
            assert.equal(paused.accepted, true);
            if (paused.accepted) {
              assert.equal(paused.plan.status, "paused");
            }

            const pausedPlan = await readSixWeekVisitorFollowup(
              visitorId, queueAsOf, { repository }
            );

            assert.equal(pausedPlan?.status, "paused");
            assert.equal(
              pausedPlan?.staffWorkflow,
              "consent_protected_public"
            );

            assert.equal(
              (await changeStatus("resume", "other-staff")).accepted,
              false
            );

            if (scenario === "task_resume_withdrawal_race") {
              const raceTable =
                createIsolatedVisitorTestTable("VisitorFollowupEvents");

              const { createPermanentVisitorConsentRepository } =
                await import("../src/repositories/permanentVisitorConsentRepository");

              const raceAuthority =
                createPermanentVisitorConsentRepository(raceTable, true);

              const prototype = Object.getPrototypeOf(raceTable) as typeof raceTable;

              const originalSubmit = prototype.submitTransaction;

              let injected = false;
              let withdrawalCommitted = false;

              prototype.submitTransaction = async function(
                this: typeof raceTable,
                ...args: Parameters<typeof originalSubmit>
              ) {
                const resumeWrite = args[0].some(action =>
                  action[0] === "create" &&
                  typeof action[1] === "object" &&
                  action[1] !== null &&
                  "type" in action[1] &&
                  action[1].type === "six_week_followup.plan_resumed" &&
                  action[1].partitionKey === visitorId
                );

                if (!injected && resumeWrite) {
                  injected = true;

                  const withdrawal = await raceAuthority.apply(
                    visitorId,
                    {
                      kind: "public_request",
                      expectedRevision: 1,
                      requestId: "synthetic-resume-race-withdrawal",
                      requestedConsent: false
                    }
                  );

                  withdrawalCommitted =
                    withdrawal.status === "committed";
                }

                return originalSubmit.apply(this, args);
              };

              try {
                const result = await changeStatus("resume");

                assert.equal(injected, true);
                assert.equal(withdrawalCommitted, true);
                assert.equal(result.accepted, false);

                if (!result.accepted) {
                  assert.equal(result.status, 409);
                }
              } finally {
                prototype.submitTransaction = originalSubmit;
              }

              const events = await repository.listByVisitor(visitorId);

              assert.equal(events.filter(event =>
                event.type === "six_week_followup.plan_resumed"
              ).length, 0);

              assert.equal(
                projectSixWeekVisitorFollowup(events)?.status,
                "paused"
              );

              await assert.rejects(
                readSixWeekVisitorFollowup(
                  visitorId, queueAsOf, { repository }
                )
              );

              console.log("CONCURRENT_RESUME_WITHDRAWAL_DENIED=True");
              return;
            }

            const resumed = await changeStatus("resume");

            assert.equal(resumed.accepted, true);
            if (resumed.accepted) {
              assert.equal(resumed.plan.status, "active");
              assert.equal(resumed.plan.ownerStaffId, actorId);
            }

            assert.equal(
              (await changeStatus("resume")).accepted,
              false
            );

            console.log("AUTHORIZED_PAUSE_RESUME_VERIFIED=True");
          }

          const taskStamp = "2026-11-24T14:00:00.000Z";
          let careWrites = 0;

          function recordTask(
            weekNumber: number,
            contactMethod: "none" | "call" | "in_person",
            actor = actorId,
            disposition: "completed" | "skipped" = "completed",
            careOutcome?: "connected" | "closed"
          ) {
            return recordSixWeekTaskOutcome({
              visitorId,
              actorId: actor,
              weekNumber,
              disposition,
              contactMethod,
              outcome: "Synthetic outcome",
              notes: null,
              careOutcome
            }, {
              repository,
              now: () =>
                scenario === "task_contact_week_six" && weekNumber === 6
                  ? "2026-11-24T15:00:00.000Z"
                  : taskStamp,
              newEventId: () => `synthetic-task-${weekNumber}`,
              readActor: async id => ({
                staffId: id,
                status: "active"
              }),
              ...(scenario === "task_contact_recovery" || scenario === "task_contact_week_six" ? {} : {
                recordCareEvent: async () => {
                  careWrites++;
                  throw Error("Unexpected Care contact write");
                }
              })
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

          } else if (
            scenario === "task_contact_recovery" ||
            scenario === "task_contact_week_six"
          ) {
            const care = getFormationEventsTableClient();
            const profiles = getFormationProfilesTableClient();

            for (const client of [care, profiles]) {
              const endpoint = new URL(client.url);

              assert.equal(endpoint.hostname, "127.0.0.1");
              assert.equal(
                endpoint.port, process.env.HOPE_VISITOR_133_PORT
              );
            }

            await care.createTable();

            try {
              await profiles.createTable();

              try {
                if (scenario === "task_contact_week_six") {
                  // Complete the earlier weeks using the
                  // existing consent-protected Staff command.
                  for (let week = 1; week <= 4; week++) {
                    assert.equal(
                      (await recordTask(week, "none")).accepted,
                      true
                    );
                  }

                  const inPerson =
                    await recordTask(5, "in_person");

                  assert.equal(inPerson.accepted, true);

                  const originalProfile =
                    await getFormationProfileByVisitorId(
                      profiles, visitorId
                    );

                  assert.equal(
                    originalProfile?.lastFollowupContactedAt,
                    taskStamp
                  );

                  // Inject a real concurrent profile update
                  // immediately before the conditional write.
                  const prototype =
                    Object.getPrototypeOf(profiles) as typeof profiles;

                  const originalUpdate = prototype.updateEntity;
                  let concurrentUpdateInjected = false;

                  prototype.updateEntity = async function (
                    this: typeof profiles,
                    ...args: Parameters<typeof originalUpdate>
                  ) {
                    if (!concurrentUpdateInjected &&
                        this.url === profiles.url &&
                        args[0].partitionKey === "VISITOR" &&
                        args[0].rowKey === visitorId) {

                      // The six-week transaction must already
                      // be durable before a Care profile race
                      // is introduced.
                      const committedEvents =
                        await repository.listByVisitor(visitorId);

                      const committedWeekSix =
                        committedEvents.filter(event =>
                          event.type ===
                            "six_week_followup.task_completed" &&
                          event.data.weekNumber === 6 &&
                          event.eventId === "synthetic-task-6"
                        );

                      assert.equal(committedWeekSix.length, 1);

                      console.log(
                        "WEEK_SIX_DURABLE_BEFORE_PROFILE_RACE=True"
                      );

                      concurrentUpdateInjected = true;

                      const concurrentEdit = {
                        partitionKey: "VISITOR",
                        rowKey: visitorId,
                        displayName: "Concurrent synthetic edit"
                      };

                      // Target the actual profile table,
                      // not whichever client was intercepted.
                      await originalUpdate.call(
                        profiles, concurrentEdit, "Merge"
                      );
                    }

                    return originalUpdate.apply(this, args);
                  };

                  try {
                    const first = await recordTask(
                      6, "call", actorId,
                      "completed", "connected"
                    );

                    assert.equal(first.accepted, false);

                    if (!first.accepted) {
                      assert.equal(first.status, 503);
                    }

                    assert.equal(concurrentUpdateInjected, true);
                  } finally {
                    prototype.updateEntity = originalUpdate;
                  }

                  const durableEvents =
                    await repository.listByVisitor(visitorId);

                  const defaultProjection =
                    projectSixWeekVisitorFollowup(durableEvents);

                  const durablePlan = projectSixWeekVisitorFollowup(
                    durableEvents,
                    "2026-11-24T15:00:00.000Z"
                  );

                  // Synthetic status-only diagnostics.
                  if (durablePlan?.status !== "completed" ||
                      defaultProjection?.status !== durablePlan.status) {
                    console.log("WEEK_SIX_DIAGNOSTIC=" +
                      JSON.stringify({
                        defaultStatus: defaultProjection?.status,
                        explicitStatus: durablePlan?.status,
                        completedTaskCount:
                          durablePlan?.completedTaskCount,
                        remainingTaskCount:
                          durablePlan?.remainingTaskCount,
                        tasks: durablePlan?.tasks.map(task => ({
                          week: task.weekNumber,
                          status: task.status
                        })),
                        events: durableEvents.map(event => ({
                          type: event.type,
                          week: event.data.weekNumber ?? null,
                          occurredAt: event.occurredAt
                        }))
                      }));
                  }

                  assert.equal(durablePlan?.status, "completed");
                  assert.equal(durablePlan.completedTaskCount, 6);
                  assert.equal(durablePlan.remainingTaskCount, 0);
                  assert.equal(durablePlan.nextTask, null);

                  // Retry must work even though the plan
                  // is already completed.
                  const retry = await recordTask(
                    6, "call", actorId,
                    "completed", "connected"
                  );

                  assert.equal(retry.accepted, true);

                  if (retry.accepted) {
                    assert.equal(retry.created, false);
                    assert.equal(retry.plan.status, "completed");
                    assert.equal(
                      retry.plan.tasks[5].careOutcome,
                      "connected"
                    );
                  }

                  const repaired =
                    await getFormationProfileByVisitorId(
                      profiles, visitorId
                    );

                  assert.equal(
                    repaired?.displayName,
                    "Concurrent synthetic edit"
                  );

                  assert.equal(
                    repaired?.lastFollowupContactedAt,
                    "2026-11-24T15:00:00.000Z"
                  );

                  const expectedIds = [
                    "synthetic-task-5:care-contact",
                    "synthetic-task-6:care-contact",
                    "synthetic-task-6:care-outcome"
                  ];

                  const page =
                    await new GlobalTimelineRepository().read(200);

                  for (const eventId of expectedIds) {
                    assert.equal(page.items.filter(item =>
                      item.eventId === eventId
                    ).length, 1);
                  }

                  // Repeating the completed outcome must
                  // not duplicate any Care records.
                  assert.equal((await recordTask(
                    6, "call", actorId,
                    "completed", "connected"
                  )).accepted, true);

                  const careRows: string[] = [];

                  for await (const row of care.listEntities()) {
                    careRows.push(String(row.idempotencyKey));
                  }

                  assert.deepEqual(
                    careRows.sort(),
                    [...expectedIds].sort()
                  );

                  await assert.rejects(
                    repository.append(ownerEvent)
                  );

                  return;
                }

                const originalAppend =
                  GlobalTimelineRepository.prototype.append;

                let injected = false;

                GlobalTimelineRepository.prototype.append =
                  async function () {
                    injected = true;
                    throw Error("Synthetic timeline outage");
                  };

                try {
                  const first = await recordTask(1, "call");

                  assert.equal(first.accepted, false);
                  if (!first.accepted) {
                    assert.equal(first.status, 503);
                  }

                  assert.equal(injected, true);
                } finally {
                  GlobalTimelineRepository.prototype.append =
                    originalAppend;
                }

                const recorded =
                  await repository.listByVisitor(visitorId);

                assert.equal(recorded.filter(e =>
                  e.type === "six_week_followup.task_completed"
                ).length, 1);

                // The Care event exists, but the injected
                // failure prevented subsequent synchronization.
                const before: unknown[] = [];

                for await (const row of care.listEntities()) {
                  before.push(row);
                }

                assert.equal(before.length, 1);

                // Exact Staff retry repairs the missing writes.
                const retry = await recordTask(1, "call");

                assert.equal(retry.accepted, true);

                if (retry.accepted) {
                  assert.equal(retry.created, false);
                }

                const profile =
                  await getFormationProfileByVisitorId(
                    profiles, visitorId
                  );

                assert.equal(
                  profile?.lastFollowupContactedAt, taskStamp
                );

                const page =
                  await new GlobalTimelineRepository().read(200);

                assert.equal(page.items.filter(item =>
                  item.eventId === "synthetic-task-1:care-contact"
                ).length, 1);

                // Withdrawal still prevents new contact work,
                // but cannot erase a committed historical fact.
                assert.equal((await authority.apply(visitorId, {
                  kind: "public_request",
                  requestId: "contact-recovery-withdrawal",
                  expectedRevision: 1,
                  requestedConsent: false
                })).status, "committed");

                assert.equal(
                  (await recordTask(1, "call")).accepted, true
                );

                assert.equal(
                  (await recordTask(2, "call")).accepted, false
                );

                const conflicting =
                  await recordTask(1, "none");

                assert.equal(conflicting.accepted, false);

                const after: unknown[] = [];

                for await (const row of care.listEntities()) {
                  after.push(row);
                }

                assert.equal(after.length, 1);
              } finally {
                await profiles.deleteTable();
              }
            } finally {
              await care.deleteTable();
            }

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
              await racingAuthority.appendStaffTaskOutcome({
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

            visitorReads = 0;

            const suppressed = await readSixWeekVisitorFollowupQueue(
              queueAsOf, queueDependencies
            );

            assert.equal(suppressed.count, 0);
            assert.equal(visitorReads, 0);

            await assert.rejects(
              readSixWeekVisitorFollowup(
                visitorId, queueAsOf, { repository }
              )
            );

            console.log("WITHDRAWN_PUBLIC_PLAN_SUPPRESSED=True");

            const paused = await changeStatus("pause");
            assert.equal(paused.accepted, true);

            const deniedResume = await changeStatus("resume");
            assert.equal(deniedResume.accepted, false);

            const statusEvents =
              await repository.listByVisitor(visitorId);

            assert.equal(
              statusEvents.filter(event =>
                event.type === "six_week_followup.plan_resumed"
              ).length,
              0
            );

            console.log("WITHDRAWN_PLAN_RESUME_DENIED=True");

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