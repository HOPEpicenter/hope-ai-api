import type { CareEvent } from "../../contracts/careEvent.v1";

export type CareCaseState = {
  careCaseId: string;
  memberId: string;
  status: "open" | "deferred" | "closed";
  priority: "low" | "medium" | "high" | null;
  category: string | null;
  ownerId: string | null;
  coOwners: string[];
  followUp: {
    phase: "not_started" | "active" | "stalled" | "completed";
    lastProgressAt: string | null;
    stalledSince: string | null;
  };
  outcome: {
    outcomeType: string | null;
    severity: "low" | "medium" | "high" | null;
    notes: string | null;
  };
};

const initialCareCaseState: CareCaseState = {
  careCaseId: "",
  memberId: "",
  status: "open",
  priority: null,
  category: null,
  ownerId: null,
  coOwners: [],
  followUp: {
    phase: "not_started",
    lastProgressAt: null,
    stalledSince: null,
  },
  outcome: {
    outcomeType: null,
    severity: null,
    notes: null,
  },
};

export function applyEvent(state: CareCaseState, event: CareEvent): CareCaseState {
  const nextState: CareCaseState = {
    ...state,
    careCaseId: event.careCaseId,
    memberId: event.memberId,
  };

  switch (event.type) {
    case "CareCaseOpened":
      return {
        ...nextState,
        status: "open",
        priority: event.payload.priority,
        category: event.payload.category,
      };
    case "CareCaseAssigned":
    case "CareCaseOwnerSynced":
      return { ...nextState, ownerId: event.payload.ownerId };
    case "CareCaseReassigned":
      return { ...nextState, ownerId: event.payload.newOwnerId };
    case "CareCaseDeferred":
      return { ...nextState, status: "deferred" };
    case "CareCaseClosed":
      return { ...nextState, status: "closed" };
    case "CareCaseFollowUpStarted":
      return {
        ...nextState,
        followUp: {
          ...state.followUp,
          phase: "active",
          lastProgressAt: event.payload.startedAt,
        },
      };
    case "CareCaseFollowUpProgressed":
      return {
        ...nextState,
        followUp: {
          ...state.followUp,
          phase: "active",
          lastProgressAt: event.occurredAt,
        },
      };
    case "CareCaseFollowUpStalledDetected":
      return {
        ...nextState,
        followUp: {
          ...state.followUp,
          phase: "stalled",
          stalledSince: event.payload.stalledSince,
        },
      };
    case "CareCaseFollowUpCompleted":
      return {
        ...nextState,
        followUp: { ...state.followUp, phase: "completed" },
      };
    case "CareOutcomeRecorded":
      return {
        ...nextState,
        outcome: {
          outcomeType: event.payload.outcomeType,
          severity: event.payload.severity,
          notes: event.payload.notes ?? null,
        },
      };
  }
}

export class CareCaseAggregate {
  private state: CareCaseState;

  constructor(initialState?: CareCaseState) {
    this.state = initialState ?? {
      ...initialCareCaseState,
      coOwners: [],
      followUp: { ...initialCareCaseState.followUp },
      outcome: { ...initialCareCaseState.outcome },
    };
  }

  public apply(event: CareEvent): void {
    this.state = applyEvent(this.state, event);
  }

  public getState(): CareCaseState {
    return this.state;
  }
}