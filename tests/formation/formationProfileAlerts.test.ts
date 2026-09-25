import assert from "node:assert/strict";
import type { FormationEvent } from "../../src/contracts/formationEvent.v1";
import {
  FormationAlertType,
  mapFormationProfileReplayToAlerts
} from "../../src/domain/alerts/formationAlert.rules";
import { FormationProfileIndex } from "../../src/domain/formation/formationProfile.index";

const memberId = "member-alerts";
const pathwayId = "pathway-alerts";
const started: FormationEvent = {
  eventId: "started",
  occurredAt: "2026-09-01T09:00:00.000Z",
  source: "api",
  memberId,
  pathwayId,
  type: "PathwayStarted",
  payload: {
    pathwayType: "new-believer",
    startedAt: "2026-09-01T09:00:00.000Z",
    initialStepId: "welcome"
  }
};

const profiles = new FormationProfileIndex();
profiles.replayEvents([
  started,
  {
    ...started,
    eventId: "stalled",
    occurredAt: "2026-09-04T09:00:00.000Z",
    type: "StepStalledDetected",
    payload: {
      stepId: "group",
      stalledSince: "2026-09-03T09:00:00.000Z",
      reason: "No response"
    }
  }
]);

assert.deepEqual(
  mapFormationProfileReplayToAlerts(profiles, memberId).map((alert) => ({
    alertId: alert.alertId,
    signalType: alert.signalType,
    severity: alert.severity,
    assignedTo: alert.assignedTo
  })),
  [
    {
      alertId: "formation-step-stalled:member-alerts:pathway-alerts:group",
      signalType: FormationAlertType.StepStalledAlert,
      severity: "medium",
      assignedTo: "pastor"
    },
    {
      alertId: "formation-pathway-stalled:member-alerts:pathway-alerts",
      signalType: FormationAlertType.PathwayStalledAlert,
      severity: "medium",
      assignedTo: "pastor"
    }
  ]
);

profiles.replayEvents([{
  ...started,
  eventId: "completed",
  occurredAt: "2026-09-05T09:00:00.000Z",
  type: "PathwayCompleted",
  payload: {
    completedAt: "2026-09-05T09:00:00.000Z",
    finalStepId: "commissioned"
  }
}]);

assert.deepEqual(
  mapFormationProfileReplayToAlerts(profiles, memberId).map((alert) => alert.signalType),
  [FormationAlertType.PathwayCompletedAlert]
);

console.log("formationProfileAlerts.test.ts passed");