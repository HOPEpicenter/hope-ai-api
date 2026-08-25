import assert from "node:assert/strict";
import {
  syncSixWeekTaskToCare
} from "../../src/services/followups/syncSixWeekTaskToCare";

async function run(): Promise<void> {
  const recorded: any[] = [];
  const dependencies = {
    recordCareEvent: async (event: unknown) => {
      recorded.push(event);
    }
  };

  const weekOne = await syncSixWeekTaskToCare(
    {
      eventId: "six-week-1",
      visitorId: "visitor-1",
      type: "six_week_followup.task_completed",
      occurredAt: "2026-08-24T23:00:00.000Z",
      actorId: "staff-1",
      data: {
        weekNumber: 1,
        contactMethod: "call",
        outcome: "Personal welcome call completed",
        notes: "Visitor plans to return."
      }
    },
    dependencies
  );

  assert.deepEqual(weekOne, {
    contactRecorded: true,
    outcomeRecorded: false,
    outcomeRequired: false
  });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].type, "FOLLOWUP_CONTACTED");
  assert.equal(recorded[0].eventId, "six-week-1:care-contact");

  const noContact = await syncSixWeekTaskToCare(
    {
      eventId: "six-week-2",
      visitorId: "visitor-1",
      type: "six_week_followup.task_completed",
      occurredAt: "2026-08-24T23:01:00.000Z",
      actorId: "staff-1",
      data: {
        weekNumber: 2,
        contactMethod: "none",
        outcome: "Attempt documented"
      }
    },
    dependencies
  );

  assert.deepEqual(noContact, {
    contactRecorded: false,
    outcomeRecorded: false,
    outcomeRequired: false
  });
  assert.equal(recorded.length, 1);

  const weekSix = await syncSixWeekTaskToCare(
    {
      eventId: "six-week-6",
      visitorId: "visitor-1",
      type: "six_week_followup.task_completed",
      occurredAt: "2026-08-24T23:02:00.000Z",
      actorId: "staff-1",
      data: {
        weekNumber: 6,
        contactMethod: "in_person",
        outcome: "Visitor is connected and will continue in ministry.",
        notes: "Connected to a small group.",
        careOutcome: "connected"
      }
    },
    dependencies
  );

  assert.deepEqual(weekSix, {
    contactRecorded: true,
    outcomeRecorded: true,
    outcomeRequired: false
  });
  assert.equal(recorded.length, 3);
  assert.equal(recorded[1].eventId, "six-week-6:care-contact");
  assert.equal(recorded[2].eventId, "six-week-6:care-outcome");
  assert.equal(recorded[2].data.outcome, "connected");

  console.log("syncSixWeekTaskToCare.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
