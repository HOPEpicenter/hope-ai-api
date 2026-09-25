import type { FormationEvent } from "../../contracts/formationEvent.v1";

export type PathwayState = {
  pathwayId: string;
  memberId: string;
  pathwayType: string | null;
  startedAt: string | null;
  completedAt: string | null;
  currentStepId: string | null;
  steps: Array<{
    stepId: string;
    completedAt?: string;
    stalledSince?: string;
    notes?: string;
    reason?: string;
  }>;
  status: "not_started" | "in_progress" | "stalled" | "completed";
};

const initialPathwayState: PathwayState = {
  pathwayId: "",
  memberId: "",
  pathwayType: null,
  startedAt: null,
  completedAt: null,
  currentStepId: null,
  steps: [],
  status: "not_started",
};

function upsertStep(
  steps: PathwayState["steps"],
  step: PathwayState["steps"][number]
): PathwayState["steps"] {
  const index = steps.findIndex(existing => existing.stepId === step.stepId);

  return index === -1
    ? [...steps, step]
    : steps.map((existing, currentIndex) =>
        currentIndex === index ? { ...existing, ...step } : existing
      );
}

export function applyFormationEvent(
  state: PathwayState,
  event: FormationEvent
): PathwayState {
  switch (event.type) {
    case "PathwayStarted":
      return {
        ...state,
        pathwayId: event.pathwayId,
        memberId: event.memberId,
        pathwayType: event.payload.pathwayType,
        startedAt: event.payload.startedAt,
        currentStepId: event.payload.initialStepId,
        status: "in_progress",
        steps: [],
      };
    case "StepCompleted":
      return {
        ...state,
        status: "in_progress",
        currentStepId: event.payload.stepId,
        steps: upsertStep(state.steps, {
          stepId: event.payload.stepId,
          completedAt: event.payload.completedAt,
          notes: event.payload.notes,
        }),
      };
    case "StepStalledDetected":
      return {
        ...state,
        status: "stalled",
        steps: upsertStep(state.steps, {
          stepId: event.payload.stepId,
          stalledSince: event.payload.stalledSince,
          reason: event.payload.reason,
        }),
      };
    case "PathwayCompleted":
      return {
        ...state,
        status: "completed",
        completedAt: event.payload.completedAt,
        currentStepId: event.payload.finalStepId,
      };
  }
}

export class PathwayAggregate {
  private state: PathwayState;

  constructor(initial?: PathwayState) {
    this.state = initial ?? { ...initialPathwayState };
  }

  public apply(event: FormationEvent): void {
    this.state = applyFormationEvent(this.state, event);
  }

  public getState(): PathwayState {
    return this.state;
  }
}