import {
  applyFollowupAssignedMutation
} from "./applyFollowupAssignedMutation";

import {
  applyFollowupOutcomeMutation
} from "./applyFollowupOutcomeMutation";

import {
  applyNextStepMutation
} from "./applyNextStepMutation";

import type {
  FormationMutationDispatcher
} from "./formationMutationDispatcher";

export const formationMutationDispatchers:
  Record<string, FormationMutationDispatcher> = {

  FOLLOWUP_ASSIGNED(args) {
    const assigneeId =
      String(args.data.assigneeId ?? "").trim();

    if (!assigneeId) {
      throw new Error(
        "FOLLOWUP_ASSIGNED requires data.assigneeId (string)"
      );
    }

    applyFollowupAssignedMutation({
      profile: args.profile,
      assigneeId,
      occurredAtIso: args.occurredAtIso,
      eventType: args.type,
      eventId: args.eventId
    });
  },

  FOLLOWUP_OUTCOME_RECORDED(args) {
    const outcome =
      String(args.data.outcome ?? "").trim();

    if (!outcome) {
      throw new Error(
        "FOLLOWUP_OUTCOME_RECORDED requires data.outcome (string)"
      );
    }

    applyFollowupOutcomeMutation({
      profile: args.profile,
      outcome,
      notes:
        typeof args.data.notes === "string"
          ? args.data.notes
          : undefined,
      occurredAtIso: args.occurredAtIso,
      eventType: args.type,
      eventId: args.eventId
    });
  },

  NEXT_STEP_SELECTED(args) {
    const nextStep =
      String(args.data.nextStep ?? "").trim();

    if (!nextStep) {
      throw new Error(
        "NEXT_STEP event requires data.nextStep (string)"
      );
    }

    applyNextStepMutation({
      profile: args.profile,
      completed: false,
      occurredAtIso: args.occurredAtIso,
      eventType: args.type,
      eventId: args.eventId
    });
  },

  NEXT_STEP_COMPLETED(args) {
    const nextStep =
      String(args.data.nextStep ?? "").trim();

    if (!nextStep) {
      throw new Error(
        "NEXT_STEP event requires data.nextStep (string)"
      );
    }

    applyNextStepMutation({
      profile: args.profile,
      completed: true,
      occurredAtIso: args.occurredAtIso,
      eventType: args.type,
      eventId: args.eventId
    });
  }
};
