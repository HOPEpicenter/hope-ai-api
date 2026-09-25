import type { FormationEvent } from "../../contracts/formationEvent.v1";

export type FormationProjectionState = {
  pathways: Array<{
    pathwayId: string;
    memberId: string;
    pathwayType: string;
    startedAt: string;
    completedAt?: string;
    status: "in_progress" | "stalled" | "completed";
    currentStepId: string;
    steps: Array<{
      stepId: string;
      completedAt?: string;
      stalledSince?: string;
      notes?: string;
      reason?: string;
    }>;
  }>;
  lastUpdatedAt: string | null;
};

const initialFormationProjectionState: FormationProjectionState = {
  pathways: [],
  lastUpdatedAt: null,
};

function upsertStep(
  steps: FormationProjectionState["pathways"][number]["steps"],
  step: FormationProjectionState["pathways"][number]["steps"][number]
): FormationProjectionState["pathways"][number]["steps"] {
  const index = steps.findIndex(existing => existing.stepId === step.stepId);

  return index === -1
    ? [...steps, step]
    : steps.map((existing, currentIndex) =>
        currentIndex === index ? { ...existing, ...step } : existing
      );
}

export function applyFormationProjectionEvent(
  state: FormationProjectionState,
  event: FormationEvent
): FormationProjectionState {
  switch (event.type) {
    case "PathwayStarted":
      return {
        pathways: [
          ...state.pathways,
          {
            pathwayId: event.pathwayId,
            memberId: event.memberId,
            pathwayType: event.payload.pathwayType,
            startedAt: event.payload.startedAt,
            status: "in_progress",
            currentStepId: event.payload.initialStepId,
            steps: [],
          },
        ],
        lastUpdatedAt: event.occurredAt,
      };
    case "StepCompleted":
      return {
        pathways: state.pathways.map(pathway =>
          pathway.pathwayId === event.pathwayId
            ? {
                ...pathway,
                status: "in_progress",
                currentStepId: event.payload.stepId,
                steps: upsertStep(pathway.steps, {
                  stepId: event.payload.stepId,
                  completedAt: event.payload.completedAt,
                  notes: event.payload.notes,
                }),
              }
            : pathway
        ),
        lastUpdatedAt: event.occurredAt,
      };
    case "StepStalledDetected":
      return {
        pathways: state.pathways.map(pathway =>
          pathway.pathwayId === event.pathwayId
            ? {
                ...pathway,
                status: "stalled",
                steps: upsertStep(pathway.steps, {
                  stepId: event.payload.stepId,
                  stalledSince: event.payload.stalledSince,
                  reason: event.payload.reason,
                }),
              }
            : pathway
        ),
        lastUpdatedAt: event.occurredAt,
      };
    case "PathwayCompleted":
      return {
        pathways: state.pathways.map(pathway =>
          pathway.pathwayId === event.pathwayId
            ? {
                ...pathway,
                status: "completed",
                completedAt: event.payload.completedAt,
                currentStepId: event.payload.finalStepId,
              }
            : pathway
        ),
        lastUpdatedAt: event.occurredAt,
      };
  }
}

export class FormationProjection {
  private state: FormationProjectionState;

  constructor(initial?: FormationProjectionState) {
    this.state = initial ?? { ...initialFormationProjectionState };
  }

  public apply(event: FormationEvent): void {
    this.state = applyFormationProjectionEvent(this.state, event);
  }

  public getState(): FormationProjectionState {
    return this.state;
  }
}