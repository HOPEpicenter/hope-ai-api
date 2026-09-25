import type { FormationEvent } from "../../contracts/formationEvent.v1";
import { FormationProfileIndex } from "../formation/formationProfile.index";
import type { RaiseAlertCommand } from "./alert.commands";

export const FormationAlertType = {
  StepStalledAlert: "StepStalledAlert",
  PathwayStalledAlert: "PathwayStalledAlert",
  PathwayCompletedAlert: "PathwayCompletedAlert"
} as const;

export type FormationAlertType =
  (typeof FormationAlertType)[keyof typeof FormationAlertType];

export function mapFormationEventToAlert(
  event: FormationEvent
): RaiseAlertCommand | null {
  switch (event.type) {
    case "StepStalledDetected":
      return {
        alertId: crypto.randomUUID(),
        memberId: event.memberId,
        careCaseId: undefined,
        signalType: "FORMATION_STEP_STALLED",
        severity: "medium",
        assignedTo: "pastor",
        metadata: {
          stepId: event.payload.stepId,
          stalledSince: event.payload.stalledSince,
          reason: event.payload.reason ?? null,
        },
        actorId: event.actorId ?? null,
      };
    case "PathwayCompleted":
      return {
        alertId: crypto.randomUUID(),
        memberId: event.memberId,
        careCaseId: undefined,
        signalType: "FORMATION_PATHWAY_COMPLETED",
        severity: "low",
        assignedTo: "care_leader",
        metadata: { finalStepId: event.payload.finalStepId },
        actorId: event.actorId ?? null,
      };
    default:
      return null;
  }
}

export function mapFormationProfileReplayToAlerts(
  profiles: FormationProfileIndex,
  memberId: string
): RaiseAlertCommand[] {
  const profile = profiles.getProfile(memberId);
  if (!profile) return [];

  const activePathway = profile.activePathway;
  const alerts: RaiseAlertCommand[] = [];

  if (activePathway?.status === "stalled") {
    for (const step of activePathway.steps.filter((candidate) => candidate.stalledSince)) {
      alerts.push({
        alertId: `formation-step-stalled:${memberId}:${activePathway.pathwayId}:${step.stepId}`,
        memberId,
        signalType: FormationAlertType.StepStalledAlert,
        severity: "medium",
        assignedTo: "pastor",
        metadata: {
          pathwayId: activePathway.pathwayId,
          stepId: step.stepId,
          stalledSince: step.stalledSince,
          reason: step.reason ?? null
        }
      });
    }

    alerts.push({
      alertId: `formation-pathway-stalled:${memberId}:${activePathway.pathwayId}`,
      memberId,
      signalType: FormationAlertType.PathwayStalledAlert,
      severity: "medium",
      assignedTo: "pastor",
      metadata: {
        pathwayId: activePathway.pathwayId,
        currentStepId: activePathway.currentStepId,
        stalledStepCount: activePathway.steps.filter((step) => step.stalledSince).length
      }
    });
  }

  for (const pathway of profile.history) {
    alerts.push({
      alertId: `formation-pathway-completed:${memberId}:${pathway.pathwayId}`,
      memberId,
      signalType: FormationAlertType.PathwayCompletedAlert,
      severity: "low",
      assignedTo: "care_leader",
      metadata: {
        pathwayId: pathway.pathwayId,
        completedAt: pathway.completedAt,
        finalStepId: pathway.currentStepId
      }
    });
  }

  return alerts;
}