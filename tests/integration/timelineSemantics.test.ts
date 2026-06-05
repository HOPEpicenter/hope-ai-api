import assert from "assert";
import {
  getTimelineActivityType,
  getTimelineSummary
} from "../../src/services/integration/timelineSemantics";

const cases = [
  {
    type: "FOLLOWUP_ASSIGNED",
    summary: "Care ownership assigned",
    activityType: "FOLLOWUP_ASSIGNED"
  },
  {
    type: "FOLLOWUP_CONTACTED",
    summary: "Pastoral contact made",
    activityType: "CONTACT_MADE"
  },
  {
    type: "FOLLOWUP_OUTCOME_RECORDED",
    summary: "Care outcome recorded",
    activityType: "FOLLOWUP_COMPLETED"
  },
  {
    type: "FOLLOWUP_UNASSIGNED",
    summary: "Care ownership removed",
    activityType: "FOLLOWUP_UNASSIGNED"
  },
  {
    type: "NEXT_STEP_SELECTED",
    summary: "Visitor selected a next step",
    activityType: "NEXT_STEP_SELECTED"
  },
  {
    type: "NEXT_STEP_COMPLETED",
    summary: "Visitor completed a next step",
    activityType: "NEXT_STEP_COMPLETED"
  }
];

for (const c of cases) {
  assert.strictEqual(getTimelineSummary(c.type), c.summary);
  assert.strictEqual(getTimelineActivityType(c.type), c.activityType);
}

assert.strictEqual(getTimelineSummary(""), "Activity recorded");
assert.strictEqual(getTimelineActivityType(""), "UNKNOWN");

console.log("timelineSemantics.test.ts passed");
