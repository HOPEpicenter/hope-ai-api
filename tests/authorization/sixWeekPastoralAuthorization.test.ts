import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  SixWeekFollowupEvent
} from "../../src/domain/followups/projectSixWeekVisitorFollowup";
import {
  resolveSixWeekActorAuthorization
} from "../../src/functions/_shared/sixWeekStaffActor";
import {
  assignSixWeekFollowupOwner,
  changeSixWeekFollowupStatus,
  confirmHistoricalSixWeekCareOutcome,
  recordSixWeekTaskOutcome,
  startSixWeekVisitorFollowup
} from "../../src/services/followups/sixWeekVisitorFollowupCommands";

function makeStaff(
  staffId: string,
  roleLabel: string | null,
  status: "active" | "inactive" = "active"
): CanonicalStaffIdentity {
  return {
    staffId,
    displayName: `Staff ${staffId}`,
    roleLabel,
    status,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    lastEventId: "evt-test",
    entraTenantId: null,
    entraObjectId: null,
    email: null,
    phone: null,
    ministryAreaId: null
  };
}

class InMemoryRepository {
  readonly events: SixWeekFollowupEvent[] = [];

  constructor(initial: SixWeekFollowupEvent[] = []) {
    this.events.push(...initial);
  }

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
        ) ||
        (
          event.type === "six_week_followup.task_care_outcome_recorded" &&
          existing.type === event.type &&
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

async function testActorResolution(): Promise<void> {
  const staffDirectory = new Map<string, CanonicalStaffIdentity>([
    ["staff-pastor", makeStaff("staff-pastor", "Pastor")],
    ["staff-leader", makeStaff("staff-leader", "Ministry Leader")],
    ["staff-care", makeStaff("staff-care", "Care Team")],
    ["staff-inactive-pastor", makeStaff("staff-inactive-pastor", "Pastor", "inactive")]
  ]);

  const mockReader = async (id: string) => staffDirectory.get(id) ?? null;

  // 1. Missing actor header/body -> 401
  {
    const res = await resolveSixWeekActorAuthorization(
      { headers: {} },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Missing x-hope-staff-actor-id");
    }
  }

  // 2. Nonexistent staff -> 403
  {
    const res = await resolveSixWeekActorAuthorization(
      { headers: { "x-hope-staff-actor-id": "unknown-staff" } },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 403);
    }
  }

  // 3. Inactive Pastor -> 403
  {
    const res = await resolveSixWeekActorAuthorization(
      { headers: { "x-hope-staff-actor-id": "staff-inactive-pastor" } },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 403);
    }
  }

  // 4. Active Ordinary Staff (Care Team) -> ok: true, returns actorId
  {
    const res = await resolveSixWeekActorAuthorization(
      { headers: { "x-hope-staff-actor-id": "staff-care" } },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.actorId, "staff-care");
      assert.equal(res.administrativeOverrideVerified, undefined);
    }
  }

  // 5. Active Pastor -> ok: true, returns actorId
  {
    const res = await resolveSixWeekActorAuthorization(
      { headers: { "x-hope-staff-actor-id": "staff-pastor" } },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.actorId, "staff-pastor");
      assert.equal(res.administrativeOverrideVerified, undefined);
    }
  }

  // 6. Active Ministry Leader -> ok: true, returns actorId
  {
    const res = await resolveSixWeekActorAuthorization(
      { headers: { "x-hope-staff-actor-id": "staff-leader" } },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.actorId, "staff-leader");
      assert.equal(res.administrativeOverrideVerified, undefined);
    }
  }

  // 7. Verified Administrator -> ok: true, administrativeOverrideVerified: true
  {
    const res = await resolveSixWeekActorAuthorization(
      { headers: { "x-admin-api-key": "admin-key", "x-hope-admin-actor-id": "staff-admin" } },
      mockReader,
      async () => ({ ok: true, actorId: "staff-admin", administrativeOverrideVerified: true })
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.actorId, "staff-admin");
      assert.equal(res.administrativeOverrideVerified, true);
    }
  }

  // 8. Trust Boundary: body.actorId alone, without x-hope-staff-actor-id, is rejected 401
  {
    const res = await resolveSixWeekActorAuthorization(
      { headers: {}, body: { actorId: "staff-pastor" } },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Missing x-hope-staff-actor-id");
    }
  }

  // 9. Trust Boundary: malicious/untrusted body.actorId cannot substitute for authenticated Staff actor
  {
    const res = await resolveSixWeekActorAuthorization(
      {
        headers: { "x-hope-staff-actor-id": "staff-care" },
        body: { actorId: "staff-pastor" }
      },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.actorId, "staff-care");
    }
  }

  // 10. Trust Boundary: when header actor and body.actorId disagree, trusted header actor is used
  {
    const res = await resolveSixWeekActorAuthorization(
      {
        headers: { "x-hope-staff-actor-id": "staff-pastor" },
        body: { actorId: "staff-care" }
      },
      mockReader,
      async () => ({ ok: true, actorId: null })
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.actorId, "staff-pastor");
    }
  }
}

async function testSixWeekPastoralAuthorizationCommands(): Promise<void> {
  const visitorId = "visitor-six-week-auth";
  const repository = new InMemoryRepository();
  let eventCounter = 0;

  const staffMap = new Map<string, CanonicalStaffIdentity>([
    ["sam-owner", makeStaff("sam-owner", "Care Team")],
    ["douglas-pastor", makeStaff("douglas-pastor", "Pastor")],
    ["sarah-leader", makeStaff("sarah-leader", "Ministry Leader")],
    ["alex-ordinary", makeStaff("alex-ordinary", "Care Team")],
    ["inactive-pastor", makeStaff("inactive-pastor", "Pastor", "inactive")],
    ["admin-staff", makeStaff("admin-staff", "Administrator")]
  ]);

  const dependencies = {
    repository,
    now: () => "2026-09-30T12:00:00.000Z",
    newEventId: () => `evt-${++eventCounter}`,
    visitorExists: async () => true,
    readActor: async (id: string) => staffMap.get(id) ?? null,
    readAssignee: async (id: string) => staffMap.get(id) ?? null,
    recordCareEvent: async () => undefined
  };

  // 1. Start follow-up plan
  const started = await startSixWeekVisitorFollowup(
    {
      visitorId,
      firstVisitDate: "2026-09-01",
      contactConsent: true,
      actorId: "sam-owner"
    },
    dependencies
  );
  assert.equal(started.accepted, true);

  // 2. Assign Sam as owner
  const assigned = await assignSixWeekFollowupOwner(
    {
      visitorId,
      ownerStaffId: "sam-owner",
      actorId: "sam-owner"
    },
    dependencies
  );
  assert.equal(assigned.accepted, true);
  if (!assigned.accepted) throw new Error("Plan assignment failed");
  assert.equal(assigned.plan.ownerStaffId, "sam-owner");

  // A. Assigned owner succeeds
  const ownerTask = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 1,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Week 1 call completed by owner",
      actorId: "sam-owner"
    },
    dependencies
  );
  assert.equal(ownerTask.accepted, true);
  if (!ownerTask.accepted) throw new Error("Owner task failed");
  assert.equal(ownerTask.plan.tasks[0].status, "completed");
  assert.equal(ownerTask.plan.ownerStaffId, "sam-owner");

  // B. Active Pastor acting on another owner's plan succeeds
  const pastorTask = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 2,
      disposition: "completed",
      contactMethod: "in_person",
      outcome: "Week 2 in-person visit by Pastor",
      actorId: "douglas-pastor"
    },
    dependencies
  );
  assert.equal(pastorTask.accepted, true);
  if (!pastorTask.accepted) throw new Error("Pastor task failed");
  assert.equal(pastorTask.plan.tasks[1].status, "completed");

  // G. Pastoral action does NOT reassign owner
  assert.equal(pastorTask.plan.ownerStaffId, "sam-owner");

  // H. Actor/audit attribution remains the actual pastoral actor
  const week2Event = repository.events.find(
    e => e.type === "six_week_followup.task_completed" && e.data.weekNumber === 2
  );
  assert.ok(week2Event);
  assert.equal(week2Event.actorId, "douglas-pastor");

  // C. Active Ministry Leader acting on another owner's plan succeeds
  const leaderTask = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 3,
      disposition: "completed",
      contactMethod: "email",
      outcome: "Week 3 email by Ministry Leader",
      actorId: "sarah-leader"
    },
    dependencies
  );
  assert.equal(leaderTask.accepted, true);
  if (!leaderTask.accepted) throw new Error("Ministry Leader task failed");
  assert.equal(leaderTask.plan.tasks[2].status, "completed");
  assert.equal(leaderTask.plan.ownerStaffId, "sam-owner");

  const week3Event = repository.events.find(
    e => e.type === "six_week_followup.task_completed" && e.data.weekNumber === 3
  );
  assert.ok(week3Event);
  assert.equal(week3Event.actorId, "sarah-leader");

  // D. Ordinary active non-owner staff is rejected 403
  const ordinaryNonOwnerTask = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 4,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Unauthorized attempt by non-owner",
      actorId: "alex-ordinary"
    },
    dependencies
  );
  assert.equal(ordinaryNonOwnerTask.accepted, false);
  if (!ordinaryNonOwnerTask.accepted) {
    assert.equal(ordinaryNonOwnerTask.status, 403);
    assert.equal(
      ordinaryNonOwnerTask.error,
      "Only the assigned follow-up owner may perform this action"
    );
  }

  // E. Inactive/nonexistent actor cannot gain pastoral override
  const inactivePastorTask = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 4,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Inactive pastor attempt",
      actorId: "inactive-pastor"
    },
    dependencies
  );
  assert.equal(inactivePastorTask.accepted, false);
  if (!inactivePastorTask.accepted) {
    assert.equal(inactivePastorTask.status, 400);
    assert.equal(
      inactivePastorTask.error,
      "actorId must reference an active staff identity"
    );
  }

  const nonexistentActorTask = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 4,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Nonexistent actor attempt",
      actorId: "ghost-actor"
    },
    dependencies
  );
  assert.equal(nonexistentActorTask.accepted, false);
  if (!nonexistentActorTask.accepted) {
    assert.equal(nonexistentActorTask.status, 400);
  }

  // F. Verified administrator behavior remains valid
  const adminTask = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 4,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Admin override task",
      actorId: "admin-staff",
      administrativeOverrideVerified: true
    },
    dependencies
  );
  assert.equal(adminTask.accepted, true);
  if (!adminTask.accepted) throw new Error("Admin task failed");
  assert.equal(adminTask.plan.tasks[3].status, "completed");
  assert.equal(adminTask.plan.ownerStaffId, "sam-owner");

  // Pastor pausing the plan (changeSixWeekFollowupStatus)
  const pausedByPastor = await changeSixWeekFollowupStatus(
    {
      visitorId,
      action: "pause",
      reason: "Pastor requested temporary pause",
      actorId: "douglas-pastor"
    },
    dependencies
  );
  assert.equal(pausedByPastor.accepted, true);
  if (!pausedByPastor.accepted) throw new Error("Pastor pause failed");
  assert.equal(pausedByPastor.plan.status, "paused");
  assert.equal(pausedByPastor.plan.ownerStaffId, "sam-owner");

  const pauseEvent = repository.events.find(
    e => e.type === "six_week_followup.plan_paused"
  );
  assert.ok(pauseEvent);
  assert.equal(pauseEvent.actorId, "douglas-pastor");

  // Pastor resuming the plan
  const resumedByLeader = await changeSixWeekFollowupStatus(
    {
      visitorId,
      action: "resume",
      actorId: "sarah-leader"
    },
    dependencies
  );
  assert.equal(resumedByLeader.accepted, true);
  if (!resumedByLeader.accepted) throw new Error("Leader resume failed");
  assert.equal(resumedByLeader.plan.status, "active");
  assert.equal(resumedByLeader.plan.ownerStaffId, "sam-owner");

  // Non-owner ordinary staff trying to pause -> 403
  const ordinaryPause = await changeSixWeekFollowupStatus(
    {
      visitorId,
      action: "pause",
      reason: "Ordinary staff pause attempt",
      actorId: "alex-ordinary"
    },
    dependencies
  );
  assert.equal(ordinaryPause.accepted, false);
  if (!ordinaryPause.accepted) {
    assert.equal(ordinaryPause.status, 403);
  }

  // Week 5 completed by owner
  const week5Task = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 5,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Week 5 check-in",
      actorId: "sam-owner"
    },
    dependencies
  );
  assert.equal(week5Task.accepted, true);

  // Week 6 completed by Pastor
  const week6Task = await recordSixWeekTaskOutcome(
    {
      visitorId,
      weekNumber: 6,
      disposition: "completed",
      contactMethod: "call",
      outcome: "Week 6 conclusion",
      careOutcome: "connected",
      actorId: "douglas-pastor"
    },
    dependencies
  );
  assert.equal(week6Task.accepted, true);
  if (!week6Task.accepted) throw new Error("Week 6 task failed");
  assert.equal(week6Task.plan.tasks[5].careOutcome, "connected");
  assert.equal(week6Task.plan.ownerStaffId, "sam-owner");

  // Confirm historical care outcome on another plan
  const historicalVisitorId = "visitor-historical";
  const historicalRepo = new InMemoryRepository([
    {
      eventId: "evt-hist-start",
      visitorId: historicalVisitorId,
      type: "six_week_followup.plan_started",
      occurredAt: "2026-08-01T00:00:00.000Z",
      actorId: "sam-owner",
      data: { firstVisitDate: "2026-08-01", contactConsent: true }
    },
    {
      eventId: "evt-hist-owner",
      visitorId: historicalVisitorId,
      type: "six_week_followup.owner_assigned",
      occurredAt: "2026-08-01T00:01:00.000Z",
      actorId: "sam-owner",
      data: { ownerStaffId: "sam-owner" }
    },
    {
      eventId: "evt-hist-w6",
      visitorId: historicalVisitorId,
      type: "six_week_followup.task_completed",
      occurredAt: "2026-09-10T00:00:00.000Z",
      actorId: "sam-owner",
      data: {
        weekNumber: 6,
        contactMethod: "call",
        outcome: "Visitor completed historical week 6"
      }
    }
  ]);

  const historicalDeps = {
    ...dependencies,
    repository: historicalRepo
  };

  // Ordinary staff cannot confirm historical care outcome on Sam's plan
  const ordinaryHistorical = await confirmHistoricalSixWeekCareOutcome(
    {
      visitorId: historicalVisitorId,
      weekNumber: 6,
      careOutcome: "connected",
      actorId: "alex-ordinary"
    },
    historicalDeps
  );
  assert.equal(ordinaryHistorical.accepted, false);
  if (!ordinaryHistorical.accepted) {
    assert.equal(ordinaryHistorical.status, 403);
  }

  // Pastor CAN confirm historical care outcome on Sam's plan
  const pastorHistorical = await confirmHistoricalSixWeekCareOutcome(
    {
      visitorId: historicalVisitorId,
      weekNumber: 6,
      careOutcome: "connected",
      notes: "Confirmed by Pastor",
      actorId: "douglas-pastor"
    },
    historicalDeps
  );
  assert.equal(pastorHistorical.accepted, true);
  if (!pastorHistorical.accepted) throw new Error("Pastor historical confirmation failed");
  assert.equal(pastorHistorical.plan.tasks[5].careOutcome, "connected");
  assert.equal(pastorHistorical.plan.ownerStaffId, "sam-owner");

  const histOutcomeEvent = historicalRepo.events.find(
    e => e.type === "six_week_followup.task_care_outcome_recorded"
  );
  assert.ok(histOutcomeEvent);
  assert.equal(histOutcomeEvent.actorId, "douglas-pastor");

  // Verify that Pastor CANNOT reassign an active claimed plan (reassigning remains admin-only)
  const activeVisitorId = "visitor-active-plan";
  await startSixWeekVisitorFollowup(
    {
      visitorId: activeVisitorId,
      firstVisitDate: "2026-09-01",
      contactConsent: true,
      actorId: "sam-owner"
    },
    dependencies
  );
  await assignSixWeekFollowupOwner(
    {
      visitorId: activeVisitorId,
      ownerStaffId: "sam-owner",
      actorId: "sam-owner"
    },
    dependencies
  );

  const pastorReassignAttempt = await assignSixWeekFollowupOwner(
    {
      visitorId: activeVisitorId,
      ownerStaffId: "douglas-pastor",
      actorId: "douglas-pastor"
    },
    dependencies
  );
  assert.equal(pastorReassignAttempt.accepted, false);
  if (!pastorReassignAttempt.accepted) {
    assert.equal(pastorReassignAttempt.status, 403);
    assert.equal(
      pastorReassignAttempt.error,
      "Only a verified ministry administrator may reassign a claimed follow-up plan"
    );
  }
}

async function run(): Promise<void> {
  await testActorResolution();
  await testSixWeekPastoralAuthorizationCommands();
  console.log("sixWeekPastoralAuthorization.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
