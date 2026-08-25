import assert from "node:assert/strict";
import type {
  SixWeekFollowupEvent
} from "../../src/domain/followups/projectSixWeekVisitorFollowup";
import {
  confirmHistoricalSixWeekCareOutcome
} from "../../src/services/followups/sixWeekVisitorFollowupCommands";

class InMemoryRepository {
  readonly events: SixWeekFollowupEvent[];

  constructor(events: SixWeekFollowupEvent[]) {
    this.events = [...events];
  }

  async append(event: SixWeekFollowupEvent): Promise<boolean> {
    if (this.events.some(item => item.eventId === event.eventId)) {
      return false;
    }

    this.events.push(event);
    return true;
  }

  async listByVisitor(visitorId: string): Promise<SixWeekFollowupEvent[]> {
    return this.events.filter(event => event.visitorId === visitorId);
  }
}

async function main(): Promise<void> {
  const visitorId = "visitor-historical-care";
  const repository = new InMemoryRepository([
    {
      eventId: "plan-started",
      visitorId,
      type: "six_week_followup.plan_started",
      occurredAt: "2026-07-01T00:00:00.000Z",
      actorId: "staff-original",
      data: {
        firstVisitDate: "2026-07-01",
        contactConsent: true
      }
    },
    {
      eventId: "week-six-completed",
      visitorId,
      type: "six_week_followup.task_completed",
      occurredAt: "2026-08-05T00:00:00.000Z",
      actorId: "staff-original",
      data: {
        weekNumber: 6,
        contactMethod: "call",
        outcome: "Visitor requested a ministry connection."
      }
    }
  ]);

  const careEvents = new Map<string, any>();
  const dependencies = {
    repository,
    now: () => "2026-08-25T12:00:00.000Z",
    newEventId: () => "historical-care-confirmation",
    readActor: async (staffId: string) =>
      staffId === "staff-confirming"
        ? { staffId, status: "active" as const }
        : null,
    recordCareEvent: async (event: any) => {
      careEvents.set(event.eventId, event);
    }
  };

  const result = await confirmHistoricalSixWeekCareOutcome(
    {
      visitorId,
      weekNumber: 6,
      careOutcome: "connected",
      notes: "Confirmed after reviewing the completed historical task.",
      actorId: "staff-confirming"
    },
    dependencies
  );

  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error("Expected confirmation to succeed.");
  assert.equal(result.created, true);
  assert.equal(result.plan.tasks[5].careOutcome, "connected");
  assert.equal(careEvents.size, 2);
  assert.equal(
    careEvents.get("week-six-completed:care-contact").occurredAt,
    "2026-08-05T00:00:00.000Z"
  );
  assert.equal(
    careEvents.get("historical-care-confirmation:care-outcome").data.outcome,
    "connected"
  );

  const retry = await confirmHistoricalSixWeekCareOutcome(
    {
      visitorId,
      weekNumber: 6,
      careOutcome: "connected",
      actorId: "staff-confirming"
    },
    dependencies
  );

  assert.equal(retry.accepted, true);
  if (!retry.accepted) throw new Error("Expected idempotent confirmation.");
  assert.equal(retry.created, false);
  assert.equal(repository.events.length, 3);

  console.log("confirmHistoricalSixWeekCareOutcome.test.ts passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
