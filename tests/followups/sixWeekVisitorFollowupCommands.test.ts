import assert from "node:assert/strict";
import type {
  SixWeekFollowupEvent
} from "../../src/domain/followups/projectSixWeekVisitorFollowup";
import {
  assignSixWeekFollowupOwner,
  changeSixWeekFollowupStatus,
  recordSixWeekTaskOutcome,
  startSixWeekVisitorFollowup
} from "../../src/services/followups/sixWeekVisitorFollowupCommands";

class InMemoryRepository {
  readonly events: SixWeekFollowupEvent[] = [];

  async append(event: SixWeekFollowupEvent): Promise<boolean> {
    const duplicate = this.events.some(existing =>
      existing.visitorId === event.visitorId &&
      (
        (
          event.type === "six_week_followup.plan_started" &&
          existing.type === event.type
        ) ||
        (
          (
            event.type === "six_week_followup.task_completed" ||
            event.type === "six_week_followup.task_skipped"
          ) &&
          (
            existing.type === "six_week_followup.task_completed" ||
            existing.type === "six_week_followup.task_skipped"
          ) &&
          existing.data.weekNumber === event.data.weekNumber
        )
      )
    );

    if (duplicate) return false;
    this.events.push(event);
    return true;
  }

  async listByVisitor(visitorId: string): Promise<SixWeekFollowupEvent[]> {
    return this.events.filter(event => event.visitorId === visitorId);
  }
}

async function run(): Promise<void> {
  const repository = new InMemoryRepository();
  let eventNumber = 0;

  const dependencies = {
    repository,
    now: () => "2026-08-19T12:00:00.000Z",
    newEventId: () => `evt-${++eventNumber}`,
    visitorExists: async (visitorId: string) => visitorId === "visitor-1",
    readActor: async (staffId: string) =>
      staffId === "staff-actor"
        ? { staffId, status: "active" as const }
        : null,
    readAssignee: async (staffId: string) =>
      staffId === "staff-owner"
        ? { staffId, status: "active" as const }
        : null
  };

  const missingConsent = await startSixWeekVisitorFollowup(
    {
      visitorId: "visitor-1",
      firstVisitDate: "2026-08-19",
      contactConsent: false,
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.deepEqual(missingConsent, {
    accepted: false,
    status: 400,
    error: "contactConsent must be true before starting follow-up"
  });

  const started = await startSixWeekVisitorFollowup(
    {
      visitorId: "visitor-1",
      firstVisitDate: "2026-08-19",
      contactConsent: true,
      preferredContactMethod: "call",
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.equal(started.accepted, true);
  if (!started.accepted) throw new Error("Expected plan start to succeed.");
  assert.equal(started.status, 201);
  assert.equal(started.created, true);
  assert.equal(started.plan.tasks.length, 6);
  assert.equal(started.plan.needsOwner, true);

  const duplicate = await startSixWeekVisitorFollowup(
    {
      visitorId: "visitor-1",
      firstVisitDate: "2026-08-20",
      contactConsent: true,
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.equal(duplicate.accepted, true);
  if (!duplicate.accepted) throw new Error("Expected idempotent start.");
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.plan.firstVisitDate, "2026-08-19");
  assert.equal(repository.events.length, 1);

  const assigned = await assignSixWeekFollowupOwner(
    {
      visitorId: "visitor-1",
      ownerStaffId: "staff-owner",
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.equal(assigned.accepted, true);
  if (!assigned.accepted) throw new Error("Expected owner assignment.");
  assert.equal(assigned.plan.ownerStaffId, "staff-owner");

  const taskResult = await recordSixWeekTaskOutcome(
    {
      visitorId: "visitor-1",
      weekNumber: 1,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Welcomed by phone",
      notes: "Visitor plans to return.",
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.equal(taskResult.accepted, true);
  if (!taskResult.accepted) throw new Error("Expected task outcome.");
  assert.equal(taskResult.plan.tasks[0].status, "completed");

  const duplicateTask = await recordSixWeekTaskOutcome(
    {
      visitorId: "visitor-1",
      weekNumber: 1,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Duplicate",
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.equal(duplicateTask.accepted, true);
  if (!duplicateTask.accepted) throw new Error("Expected idempotent task.");
  assert.equal(duplicateTask.created, false);

  const paused = await changeSixWeekFollowupStatus(
    {
      visitorId: "visitor-1",
      action: "pause",
      reason: "Visitor requested a pause",
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.equal(paused.accepted, true);
  if (!paused.accepted) throw new Error("Expected pause.");
  assert.equal(paused.plan.status, "paused");

  const blockedTask = await recordSixWeekTaskOutcome(
    {
      visitorId: "visitor-1",
      weekNumber: 2,
      disposition: "completed",
      contactMethod: "email",
      outcome: "Sent invitation",
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.deepEqual(blockedTask, {
    accepted: false,
    status: 409,
    error: "Follow-up plan is paused"
  });

  const resumed = await changeSixWeekFollowupStatus(
    {
      visitorId: "visitor-1",
      action: "resume",
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.equal(resumed.accepted, true);
  if (!resumed.accepted) throw new Error("Expected resume.");
  assert.equal(resumed.plan.status, "active");

  const cancelled = await changeSixWeekFollowupStatus(
    {
      visitorId: "visitor-1",
      action: "cancel",
      reason: "Visitor opted out",
      actorId: "staff-actor"
    },
    dependencies
  );

  assert.equal(cancelled.accepted, true);
  if (!cancelled.accepted) throw new Error("Expected cancellation.");
  assert.equal(cancelled.plan.status, "cancelled");
  assert.equal(cancelled.plan.cancellationReason, "Visitor opted out");

  console.log("sixWeekVisitorFollowupCommands.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
