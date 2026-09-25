import assert from "node:assert/strict";
import type {
  SixWeekFollowupEvent
} from "../../src/domain/followups/projectSixWeekVisitorFollowup";
import {
  applyActivityIntelligenceResolution
} from "../../src/services/followups/applyActivityIntelligenceResolution";

class InMemoryRepository {
  readonly events: SixWeekFollowupEvent[] = [
    {
      eventId: "evt-plan",
      visitorId: "visitor-1",
      type: "six_week_followup.plan_started",
      occurredAt: "2026-09-01T12:00:00.000Z",
      actorId: "staff-owner",
      data: {
        firstVisitDate: "2026-09-01",
        ownerStaffId: "staff-owner",
        contactConsent: true,
        preferredContactMethod: "call"
      }
    }
  ];

  async append(event: SixWeekFollowupEvent): Promise<boolean> {
    if (this.events.some(existing => existing.eventId === event.eventId)) {
      return false;
    }

    this.events.push(event);
    return true;
  }

  async listByVisitor(visitorId: string): Promise<SixWeekFollowupEvent[]> {
    return this.events.filter(event => event.visitorId === visitorId);
  }
}

async function run(): Promise<void> {
  const repository = new InMemoryRepository();
  const dependencies = {
    repository,
    now: () => "2026-09-10T12:00:00.000Z",
    readActor: async (staffId: string) => ({ staffId, status: "active" as const }),
    readAssignee: async (staffId: string) => ({ staffId, status: "active" as const })
  };

  const unauthorizedReassignment = await applyActivityIntelligenceResolution(
    {
      visitorId: "visitor-1",
      eventId: "evt-reassign",
      actorId: "staff-other",
      type: "FOLLOWUP_ASSIGNED",
      data: { assigneeId: "staff-new-owner" }
    },
    dependencies
  );

  assert.deepEqual(unauthorizedReassignment, {
    synced: false,
    created: false,
    reason: "invalid_resolution"
  });
  assert.equal(repository.events.length, 1);

  const unverifiedOverride = await applyActivityIntelligenceResolution(
    {
      visitorId: "visitor-1",
      eventId: "evt-unverified",
      actorId: "staff-other",
      type: "NEXT_STEP_SELECTED",
      data: { nextStep: "Attend newcomers lunch" }
    },
    dependencies
  );

  assert.deepEqual(unverifiedOverride, {
    synced: false,
    created: false,
    reason: "invalid_resolution"
  });
  assert.equal(repository.events.length, 1);

  const verifiedOverride = await applyActivityIntelligenceResolution(
    {
      visitorId: "visitor-1",
      eventId: "evt-verified",
      actorId: "staff-admin",
      type: "NEXT_STEP_SELECTED",
      data: { nextStep: "Attend newcomers lunch" },
      administrativeOverrideVerified: true
    },
    dependencies
  );

  assert.deepEqual(verifiedOverride, {
    synced: true,
    created: true,
    reason: "updated"
  });
  assert.equal(repository.events[1]?.actorId, "staff-admin");

  const replay = await applyActivityIntelligenceResolution(
    {
      visitorId: "visitor-1",
      eventId: "evt-verified",
      actorId: "staff-admin",
      type: "NEXT_STEP_SELECTED",
      data: { nextStep: "Attend newcomers lunch" },
      administrativeOverrideVerified: true
    },
    dependencies
  );

  assert.deepEqual(replay, {
    synced: false,
    created: false,
    reason: "already_applied"
  });
  assert.equal(repository.events.length, 2);

  console.log("applyActivityIntelligenceResolution.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});