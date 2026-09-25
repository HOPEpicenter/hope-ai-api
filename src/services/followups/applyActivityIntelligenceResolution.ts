import {
  projectSixWeekVisitorFollowup,
  type SixWeekFollowupEvent
} from "../../domain/followups/projectSixWeekVisitorFollowup";
import {
  assignSixWeekFollowupOwner,
  recordSixWeekTaskOutcome,
  type SixWeekFollowupCommandDependencies
} from "./sixWeekVisitorFollowupCommands";
import { SixWeekFollowupEventsRepository } from "../../repositories/sixWeekFollowupEventsRepository";
import { isSixWeekCareOutcome } from "./syncSixWeekTaskToCare";

type ResolutionType =
  | "NEXT_STEP_SELECTED"
  | "NEXT_STEP_COMPLETED"
  | "FOLLOWUP_OUTCOME_RECORDED"
  | "FOLLOWUP_ASSIGNED";

type ResolutionInput = {
  visitorId: string;
  eventId: string;
  actorId: string;
  type: ResolutionType;
  data: Record<string, unknown>;
  skipSixWeekSync?: boolean;
  administrativeOverrideVerified?: true;
};

export type ActivityIntelligenceSixWeekSyncResult = {
  synced: boolean;
  created: boolean;
  reason:
    | "updated"
    | "no_plan"
    | "plan_not_active"
    | "explicit_override"
    | "invalid_resolution"
    | "already_applied";
};

type FollowupRepository = SixWeekFollowupCommandDependencies["repository"];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function repositoryFor(repository?: FollowupRepository) {
  return repository ?? new SixWeekFollowupEventsRepository();
}

async function appendCareOutcomeEvent(params: {
  repository: NonNullable<FollowupRepository>;
  visitorId: string;
  eventId: string;
  actorId: string;
  careOutcome: "connected" | "closed";
  now: string;
}) {
  const event: SixWeekFollowupEvent = {
    eventId: params.eventId,
    visitorId: params.visitorId,
    type: "six_week_followup.task_care_outcome_recorded",
    occurredAt: params.now,
    actorId: params.actorId,
    data: {
      weekNumber: 6,
      careOutcome: params.careOutcome,
      notes: "Resolved through Activity Intelligence"
    }
  };

  const created = await params.repository.append(event);
  return { created };
}

export async function applyActivityIntelligenceResolution(
  input: ResolutionInput,
  dependencies: SixWeekFollowupCommandDependencies = {}
): Promise<ActivityIntelligenceSixWeekSyncResult> {
  if (input.skipSixWeekSync === true) {
    return {
      synced: false,
      created: false,
      reason: "explicit_override"
    };
  }

  const repository = repositoryFor(dependencies.repository);
  const events = await repository.listByVisitor(input.visitorId);
  const plan = projectSixWeekVisitorFollowup(events);

  if (!plan) {
    return {
      synced: false,
      created: false,
      reason: "no_plan"
    };
  }

  if (plan.status !== "active") {
    return {
      synced: false,
      created: false,
      reason: "plan_not_active"
    };
  }

  const commandDependencies: SixWeekFollowupCommandDependencies = {
    ...dependencies,
    repository,
    now: dependencies.now ?? (() => new Date().toISOString()),
    newEventId: () => input.eventId
  };

  if (
    input.type === "NEXT_STEP_SELECTED" ||
    input.type === "NEXT_STEP_COMPLETED"
  ) {
    const task = plan.tasks.find(task => task.weekNumber === 5);
    if (!task || task.status === "completed" || task.status === "skipped") {
      return {
        synced: false,
        created: false,
        reason: "already_applied"
      };
    }

    const nextStep = text(input.data.nextStep);
    if (!nextStep) {
      return {
        synced: false,
        created: false,
        reason: "invalid_resolution"
      };
    }

    const result = await recordSixWeekTaskOutcome(
      {
        visitorId: input.visitorId,
        weekNumber: 5,
        disposition: "completed",
        contactMethod: "none",
        outcome:
          input.type === "NEXT_STEP_COMPLETED"
            ? "next_step_completed"
            : "next_step_selected",
        notes: nextStep,
        actorId: input.actorId,
        administrativeOverrideVerified: input.administrativeOverrideVerified
      },
      commandDependencies
    );

    return {
      synced: result.accepted,
      created: result.accepted && result.created,
      reason: result.accepted ? "updated" : "invalid_resolution"
    };
  }

  if (input.type === "FOLLOWUP_ASSIGNED") {
    const ownerStaffId = text(input.data.assigneeId);
    if (!ownerStaffId) {
      return {
        synced: false,
        created: false,
        reason: "invalid_resolution"
      };
    }

    const result = await assignSixWeekFollowupOwner(
      {
        visitorId: input.visitorId,
        ownerStaffId,
        actorId: input.actorId,
        administrativeOverrideVerified: input.administrativeOverrideVerified
      },
      commandDependencies
    );

    return {
      synced: result.accepted,
      created: result.accepted && result.created,
      reason: result.accepted ? "updated" : "invalid_resolution"
    };
  }

  const careOutcome = text(input.data.outcome).toLowerCase();
  if (!isSixWeekCareOutcome(careOutcome)) {
    return {
      synced: false,
      created: false,
      reason: "invalid_resolution"
    };
  }

  const weekSixTask = plan.tasks.find(task => task.weekNumber === 6);
  if (!weekSixTask || weekSixTask.careOutcome === careOutcome) {
    return {
      synced: false,
      created: false,
      reason: "already_applied"
    };
  }

  if (
    weekSixTask.status !== "completed" &&
    weekSixTask.status !== "skipped"
  ) {
    const result = await recordSixWeekTaskOutcome(
      {
        visitorId: input.visitorId,
        weekNumber: 6,
        disposition: "completed",
        contactMethod: "none",
        outcome: "care_outcome_recorded",
        careOutcome,
        notes: "Resolved through Activity Intelligence",
        actorId: input.actorId,
        administrativeOverrideVerified: input.administrativeOverrideVerified
      },
      commandDependencies
    );

    return {
      synced: result.accepted,
      created: result.accepted && result.created,
      reason: result.accepted ? "updated" : "invalid_resolution"
    };
  }

  const result = await appendCareOutcomeEvent({
    repository,
    visitorId: input.visitorId,
    eventId: input.eventId,
    actorId: input.actorId,
    careOutcome,
    now: (dependencies.now ?? (() => new Date().toISOString()))()
  });

  return {
    synced: true,
    created: result.created,
    reason: result.created ? "updated" : "already_applied"
  };
}
