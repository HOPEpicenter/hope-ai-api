import { randomUUID } from "node:crypto";
import type {
  SixWeekCareOutcome,
  SixWeekContactMethod,
  SixWeekFollowupEvent,
  SixWeekFollowupEventType,
  SixWeekVisitorFollowupPlan
} from "../../domain/followups/projectSixWeekVisitorFollowup";
import {
  projectSixWeekVisitorFollowup
} from "../../domain/followups/projectSixWeekVisitorFollowup";
import { SixWeekFollowupEventsRepository } from "../../repositories/sixWeekFollowupEventsRepository";
import {
  getVisitorById
} from "../../functions/_shared/visitorsRepository";
import {
  readCanonicalStaffIdentity,
  readMutationActorStaffIdentity
} from "../staff/readCanonicalStaffDirectory";
import {
  isSixWeekCareOutcome,
  syncHistoricalSixWeekTaskCareOutcomeToCare,
  syncSixWeekTaskToCare,
  type SixWeekCareEventRecorder
} from "./syncSixWeekTaskToCare";

type FollowupRepository = Pick<
  SixWeekFollowupEventsRepository,
  "append" | "listByVisitor"
>;

type StaffIdentity = {
  staffId: string;
  status: "active" | "inactive";
};

export type SixWeekFollowupCommandDependencies = {
  repository?: FollowupRepository;
  now?: () => string;
  newEventId?: () => string;
  visitorExists?: (visitorId: string) => Promise<boolean>;
  readActor?: (actorId: string) => Promise<StaffIdentity | null>;
  readAssignee?: (staffId: string) => Promise<StaffIdentity | null>;
  recordCareEvent?: SixWeekCareEventRecorder;
};

export type SixWeekFollowupCommandSuccess = {
  accepted: true;
  status: number;
  created: boolean;
  eventId: string;
  eventType: SixWeekFollowupEventType;
  plan: SixWeekVisitorFollowupPlan;
};

export type SixWeekFollowupCommandFailure = {
  accepted: false;
  status: number;
  error: string;
};

export type SixWeekFollowupCommandResult =
  | SixWeekFollowupCommandSuccess
  | SixWeekFollowupCommandFailure;

export type StartSixWeekFollowupInput = {
  visitorId: string;
  firstVisitDate: string;
  ownerStaffId?: string | null;
  contactConsent: boolean;
  preferredContactMethod?: SixWeekContactMethod | null;
  actorId: string;
};

export type AssignSixWeekFollowupOwnerInput = {
  visitorId: string;
  ownerStaffId: string;
  actorId: string;
};

export type RecordSixWeekTaskOutcomeInput = {
  visitorId: string;
  weekNumber: number;
  disposition: "completed" | "skipped";
  contactMethod: SixWeekContactMethod;
  outcome: string;
  careOutcome?: SixWeekCareOutcome | null;
  notes?: string | null;
  actorId: string;
};

export type ConfirmHistoricalSixWeekCareOutcomeInput = {
  visitorId: string;
  weekNumber: number;
  careOutcome: SixWeekCareOutcome;
  notes?: string | null;
  actorId: string;
};

export type ChangeSixWeekPlanStatusInput = {
  visitorId: string;
  action: "pause" | "resume" | "cancel";
  reason?: string | null;
  actorId: string;
};

const CONTACT_METHODS = new Set<SixWeekContactMethod>([
  "call",
  "email",
  "in_person",
  "none"
]);

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function validVisitDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function defaultEventId(): string {
  return `evt-${randomUUID().replace(/-/g, "")}`;
}

function repositoryFor(
  dependencies: SixWeekFollowupCommandDependencies
): FollowupRepository {
  return dependencies.repository ?? new SixWeekFollowupEventsRepository();
}

async function defaultVisitorExists(visitorId: string): Promise<boolean> {
  return (await getVisitorById(visitorId)) !== null;
}

async function requireActiveActor(
  actorId: string,
  dependencies: SixWeekFollowupCommandDependencies
): Promise<SixWeekFollowupCommandFailure | null> {
  const actor = await (
    dependencies.readActor ?? readMutationActorStaffIdentity
  )(actorId);

  if (!actor || actor.status !== "active") {
    return {
      accepted: false,
      status: 400,
      error: "actorId must reference an active staff identity"
    };
  }

  return null;
}

async function requireActiveAssignee(
  ownerStaffId: string,
  dependencies: SixWeekFollowupCommandDependencies
): Promise<SixWeekFollowupCommandFailure | null> {
  const assignee = await (
    dependencies.readAssignee ?? readCanonicalStaffIdentity
  )(ownerStaffId);

  if (!assignee || assignee.status !== "active") {
    return {
      accepted: false,
      status: 400,
      error: "ownerStaffId must reference an active canonical staff identity"
    };
  }

  return null;
}

function commandFailure(
  status: number,
  error: string
): SixWeekFollowupCommandFailure {
  return { accepted: false, status, error };
}

async function appendAndProject(params: {
  repository: FollowupRepository;
  event: SixWeekFollowupEvent;
  asOf: string;
  successStatus: number;
}): Promise<SixWeekFollowupCommandResult> {
  const created = await params.repository.append(params.event);
  const events = await params.repository.listByVisitor(
    params.event.visitorId
  );
  const plan = projectSixWeekVisitorFollowup(events, params.asOf);

  if (!plan) {
    return commandFailure(500, "Six-week follow-up projection failed");
  }

  return {
    accepted: true,
    status: created ? params.successStatus : 200,
    created,
    eventId: created ? params.event.eventId : plan.lastEventId,
    eventType: params.event.type,
    plan
  };
}

export async function startSixWeekVisitorFollowup(
  input: StartSixWeekFollowupInput,
  dependencies: SixWeekFollowupCommandDependencies = {}
): Promise<SixWeekFollowupCommandResult> {
  const visitorId = normalizeText(input.visitorId);
  const firstVisitDate = normalizeText(input.firstVisitDate);
  const ownerStaffId = normalizeText(input.ownerStaffId) || null;
  const actorId = normalizeText(input.actorId);

  if (!visitorId) return commandFailure(400, "visitorId is required");
  if (!validVisitDate(firstVisitDate)) {
    return commandFailure(400, "firstVisitDate must be YYYY-MM-DD");
  }
  if (input.contactConsent !== true) {
    return commandFailure(
      400,
      "contactConsent must be true before starting follow-up"
    );
  }
  if (!actorId) return commandFailure(400, "actorId is required");

  const preferredContactMethod =
    input.preferredContactMethod ?? null;

  if (
    preferredContactMethod !== null &&
    !CONTACT_METHODS.has(preferredContactMethod)
  ) {
    return commandFailure(400, "preferredContactMethod is invalid");
  }

  const exists = await (
    dependencies.visitorExists ?? defaultVisitorExists
  )(visitorId);

  if (!exists) return commandFailure(404, "Visitor not found");

  const actorFailure = await requireActiveActor(actorId, dependencies);
  if (actorFailure) return actorFailure;

  if (ownerStaffId) {
    const assigneeFailure = await requireActiveAssignee(
      ownerStaffId,
      dependencies
    );
    if (assigneeFailure) return assigneeFailure;
  }

  const occurredAt = (
    dependencies.now ?? (() => new Date().toISOString())
  )();

  return appendAndProject({
    repository: repositoryFor(dependencies),
    asOf: occurredAt,
    successStatus: 201,
    event: {
      eventId: (dependencies.newEventId ?? defaultEventId)(),
      visitorId,
      type: "six_week_followup.plan_started",
      occurredAt,
      actorId,
      data: {
        firstVisitDate,
        ownerStaffId,
        contactConsent: true,
        preferredContactMethod
      }
    }
  });
}

export async function assignSixWeekFollowupOwner(
  input: AssignSixWeekFollowupOwnerInput,
  dependencies: SixWeekFollowupCommandDependencies = {}
): Promise<SixWeekFollowupCommandResult> {
  const visitorId = normalizeText(input.visitorId);
  const ownerStaffId = normalizeText(input.ownerStaffId);
  const actorId = normalizeText(input.actorId);

  if (!visitorId) return commandFailure(400, "visitorId is required");
  if (!ownerStaffId) {
    return commandFailure(400, "ownerStaffId is required");
  }
  if (!actorId) return commandFailure(400, "actorId is required");

  const actorFailure = await requireActiveActor(actorId, dependencies);
  if (actorFailure) return actorFailure;

  const assigneeFailure = await requireActiveAssignee(
    ownerStaffId,
    dependencies
  );
  if (assigneeFailure) return assigneeFailure;

  const repository = repositoryFor(dependencies);
  const existing = projectSixWeekVisitorFollowup(
    await repository.listByVisitor(visitorId)
  );

  if (!existing) return commandFailure(404, "Follow-up plan not found");
  if (existing.status === "completed" || existing.status === "cancelled") {
    return commandFailure(409, "Follow-up plan is closed");
  }

  const occurredAt = (
    dependencies.now ?? (() => new Date().toISOString())
  )();

  return appendAndProject({
    repository,
    asOf: occurredAt,
    successStatus: 202,
    event: {
      eventId: (dependencies.newEventId ?? defaultEventId)(),
      visitorId,
      type: "six_week_followup.owner_assigned",
      occurredAt,
      actorId,
      data: { ownerStaffId }
    }
  });
}

export async function recordSixWeekTaskOutcome(
  input: RecordSixWeekTaskOutcomeInput,
  dependencies: SixWeekFollowupCommandDependencies = {}
): Promise<SixWeekFollowupCommandResult> {
  const visitorId = normalizeText(input.visitorId);
  const actorId = normalizeText(input.actorId);
  const outcome = normalizeText(input.outcome);
  const notes = normalizeText(input.notes) || null;

  if (!visitorId) return commandFailure(400, "visitorId is required");
  if (!Number.isInteger(input.weekNumber) || input.weekNumber < 1 || input.weekNumber > 6) {
    return commandFailure(400, "weekNumber must be between 1 and 6");
  }
  if (input.disposition !== "completed" && input.disposition !== "skipped") {
    return commandFailure(400, "disposition must be completed or skipped");
  }
  if (!CONTACT_METHODS.has(input.contactMethod)) {
    return commandFailure(400, "contactMethod is invalid");
  }

  const careOutcome = normalizeText(input.careOutcome).toLowerCase();
  const verifiedCareContact =
    input.disposition === "completed" && input.contactMethod !== "none";

  if (careOutcome && !isSixWeekCareOutcome(careOutcome)) {
    return commandFailure(
      400,
      "careOutcome must be connected or closed"
    );
  }

  if (input.weekNumber !== 6 && careOutcome) {
    return commandFailure(
      400,
      "careOutcome is only valid for week 6"
    );
  }

  if (input.weekNumber === 6 && verifiedCareContact && !careOutcome) {
    return commandFailure(
      400,
      "careOutcome is required for verified week 6 contact"
    );
  }

  if (!outcome) return commandFailure(400, "outcome is required");
  if (outcome.length > 160) {
    return commandFailure(400, "outcome must be 160 characters or fewer");
  }
  if (notes && notes.length > 2000) {
    return commandFailure(400, "notes must be 2000 characters or fewer");
  }
  if (!actorId) return commandFailure(400, "actorId is required");

  const actorFailure = await requireActiveActor(actorId, dependencies);
  if (actorFailure) return actorFailure;

  const repository = repositoryFor(dependencies);
  const existing = projectSixWeekVisitorFollowup(
    await repository.listByVisitor(visitorId)
  );

  if (!existing) return commandFailure(404, "Follow-up plan not found");
  if (existing.status === "paused") {
    return commandFailure(409, "Follow-up plan is paused");
  }
  if (existing.status === "completed" || existing.status === "cancelled") {
    return commandFailure(409, "Follow-up plan is closed");
  }

  const task = existing.tasks.find(
    item => item.weekNumber === input.weekNumber
  );

  if (!task) return commandFailure(404, "Follow-up task not found");
  if (task.status === "completed" || task.status === "skipped") {
    const storedTaskEvent = (
      await repository.listByVisitor(visitorId)
    ).find(
      event =>
        (event.type === "six_week_followup.task_completed" ||
          event.type === "six_week_followup.task_skipped") &&
        Number(event.data.weekNumber) === input.weekNumber
    );

    if (storedTaskEvent) {
      await syncSixWeekTaskToCare(storedTaskEvent, {
        recordCareEvent: dependencies.recordCareEvent
      });
    }

    return {
      accepted: true,
      status: 200,
      created: false,
      eventId: existing.lastEventId,
      eventType:
        task.status === "completed"
          ? "six_week_followup.task_completed"
          : "six_week_followup.task_skipped",
      plan: existing
    };
  }

  const occurredAt = (
    dependencies.now ?? (() => new Date().toISOString())
  )();

  const eventType: SixWeekFollowupEventType =
    input.disposition === "completed"
      ? "six_week_followup.task_completed"
      : "six_week_followup.task_skipped";

  const event: SixWeekFollowupEvent = {
    eventId: (dependencies.newEventId ?? defaultEventId)(),
    visitorId,
    type: eventType,
    occurredAt,
    actorId,
    data: {
      weekNumber: input.weekNumber,
      contactMethod: input.contactMethod,
      outcome,
      careOutcome: isSixWeekCareOutcome(careOutcome)
        ? careOutcome
        : null,
      notes
    }
  };

  const result = await appendAndProject({
    repository,
    asOf: occurredAt,
    successStatus: 202,
    event
  });

  if (!result.accepted) {
    return result;
  }

  const storedTaskEvent = result.created
    ? event
    : (
        await repository.listByVisitor(visitorId)
      ).find(
        item =>
          (item.type === "six_week_followup.task_completed" ||
            item.type === "six_week_followup.task_skipped") &&
          Number(item.data.weekNumber) === input.weekNumber
      );

  if (storedTaskEvent) {
    await syncSixWeekTaskToCare(storedTaskEvent, {
      recordCareEvent: dependencies.recordCareEvent
    });
  }

  return result;
}

export async function confirmHistoricalSixWeekCareOutcome(
  input: ConfirmHistoricalSixWeekCareOutcomeInput,
  dependencies: SixWeekFollowupCommandDependencies = {}
): Promise<SixWeekFollowupCommandResult> {
  const visitorId = normalizeText(input.visitorId);
  const actorId = normalizeText(input.actorId);
  const careOutcome = normalizeText(input.careOutcome).toLowerCase();
  const notes = normalizeText(input.notes) || null;

  if (!visitorId) return commandFailure(400, "visitorId is required");
  if (input.weekNumber !== 6) {
    return commandFailure(400, "only historical week 6 care outcomes can be confirmed");
  }
  if (!isSixWeekCareOutcome(careOutcome)) {
    return commandFailure(400, "careOutcome must be connected or closed");
  }
  if (notes && notes.length > 2000) {
    return commandFailure(400, "notes must be 2000 characters or fewer");
  }
  if (!actorId) return commandFailure(400, "actorId is required");

  const actorFailure = await requireActiveActor(actorId, dependencies);
  if (actorFailure) return actorFailure;

  const repository = repositoryFor(dependencies);
  const events = await repository.listByVisitor(visitorId);
  const plan = projectSixWeekVisitorFollowup(events);

  if (!plan) return commandFailure(404, "Follow-up plan not found");

  const taskEvent = events.find(
    event =>
      event.type === "six_week_followup.task_completed" &&
      Number(event.data.weekNumber) === 6
  );

  if (!taskEvent) {
    return commandFailure(409, "Week 6 must be completed before confirming a care outcome");
  }
  if (taskEvent.data.contactMethod === "none") {
    return commandFailure(409, "Week 6 has no verified care contact");
  }

  const existingConfirmation = events.find(
    event =>
      event.type === "six_week_followup.task_care_outcome_recorded" &&
      Number(event.data.weekNumber) === 6
  );

  if (existingConfirmation) {
    await syncHistoricalSixWeekTaskCareOutcomeToCare(
      taskEvent,
      existingConfirmation,
      { recordCareEvent: dependencies.recordCareEvent }
    );

    return {
      accepted: true,
      status: 200,
      created: false,
      eventId: existingConfirmation.eventId,
      eventType: existingConfirmation.type,
      plan
    };
  }

  if (plan.tasks[5]?.careOutcome) {
    return commandFailure(409, "Week 6 care outcome is already recorded");
  }

  const occurredAt = (
    dependencies.now ?? (() => new Date().toISOString())
  )();

  const event: SixWeekFollowupEvent = {
    eventId: (dependencies.newEventId ?? defaultEventId)(),
    visitorId,
    type: "six_week_followup.task_care_outcome_recorded",
    occurredAt,
    actorId,
    data: {
      weekNumber: 6,
      careOutcome,
      notes
    }
  };

  const result = await appendAndProject({
    repository,
    asOf: occurredAt,
    successStatus: 202,
    event
  });

  if (!result.accepted) return result;

  await syncHistoricalSixWeekTaskCareOutcomeToCare(
    taskEvent,
    event,
    { recordCareEvent: dependencies.recordCareEvent }
  );

  return result;
}

export async function changeSixWeekFollowupStatus(
  input: ChangeSixWeekPlanStatusInput,
  dependencies: SixWeekFollowupCommandDependencies = {}
): Promise<SixWeekFollowupCommandResult> {
  const visitorId = normalizeText(input.visitorId);
  const actorId = normalizeText(input.actorId);
  const reason = normalizeText(input.reason) || null;

  if (!visitorId) return commandFailure(400, "visitorId is required");
  if (!actorId) return commandFailure(400, "actorId is required");
  if (!new Set(["pause", "resume", "cancel"]).has(input.action)) {
    return commandFailure(400, "action must be pause, resume, or cancel");
  }
  if ((input.action === "pause" || input.action === "cancel") && !reason) {
    return commandFailure(400, "reason is required for pause or cancel");
  }

  const actorFailure = await requireActiveActor(actorId, dependencies);
  if (actorFailure) return actorFailure;

  const repository = repositoryFor(dependencies);
  const existing = projectSixWeekVisitorFollowup(
    await repository.listByVisitor(visitorId)
  );

  if (!existing) return commandFailure(404, "Follow-up plan not found");
  if (existing.status === "completed" || existing.status === "cancelled") {
    return commandFailure(409, "Follow-up plan is closed");
  }
  if (input.action === "pause" && existing.status === "paused") {
    return commandFailure(409, "Follow-up plan is already paused");
  }
  if (input.action === "resume" && existing.status !== "paused") {
    return commandFailure(409, "Only a paused follow-up plan can resume");
  }

  const occurredAt = (
    dependencies.now ?? (() => new Date().toISOString())
  )();

  const eventType: SixWeekFollowupEventType =
    input.action === "pause"
      ? "six_week_followup.plan_paused"
      : input.action === "resume"
        ? "six_week_followup.plan_resumed"
        : "six_week_followup.plan_cancelled";

  return appendAndProject({
    repository,
    asOf: occurredAt,
    successStatus: 202,
    event: {
      eventId: (dependencies.newEventId ?? defaultEventId)(),
      visitorId,
      type: eventType,
      occurredAt,
      actorId,
      data: { reason }
    }
  });
}
