import { randomUUID } from "crypto";
import type {
  StaffEvent,
  StaffEventData,
  StaffEventType
} from "../../domain/staff/projectStaffDirectory";
import type {
  StaffStatus
} from "../operators/operatorIdentity";
import { StaffEventsRepository } from "../../repositories/staffEventsRepository";
import {
  readCanonicalStaffIdentity
} from "./readCanonicalStaffDirectory";

type StaffEventWriter = Pick<StaffEventsRepository, "append">;

export type StaffCommandDependencies = {
  repository?: StaffEventsRepository;
  now?: () => string;
  newEventId?: () => string;
  newStaffId?: () => string;
};

export type CreateStaffIdentityInput = {
  displayName: string;
  roleLabel?: string | null;
  actorId: string;
};

export type UpdateStaffIdentityInput = {
  staffId: string;
  displayName?: string;
  roleLabel?: string | null;
  status?: StaffStatus;
  reason?: string | null;
  actorId: string;
};

export type AcceptedStaffCommand = {
  accepted: true;
  eventId: string;
  staffId: string;
  type: StaffEventType;
};

export type StaffCommandFailure = {
  accepted: false;
  status: number;
  error: string;
};

export type StaffCommandResult =
  | AcceptedStaffCommand
  | StaffCommandFailure;

function normalizeRequiredText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalText(
  value: unknown
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value ?? "").trim();

  return normalized || null;
}

function defaultEventId(): string {
  return "evt-" + randomUUID().replace(/-/g, "");
}

function defaultStaffId(): string {
  return "staff-" + randomUUID().replace(/-/g, "");
}

function buildEvent(params: {
  eventId: string;
  staffId: string;
  type: StaffEventType;
  occurredAt: string;
  actorId: string;
  data: StaffEventData;
}): StaffEvent {
  return {
    eventId: params.eventId,
    staffId: params.staffId,
    type: params.type,
    occurredAt: params.occurredAt,
    actorId: params.actorId,
    data: params.data
  };
}

export async function createStaffIdentity(
  input: CreateStaffIdentityInput,
  dependencies: StaffCommandDependencies = {}
): Promise<StaffCommandResult> {
  const displayName = normalizeRequiredText(input.displayName);
  const actorId = normalizeRequiredText(input.actorId);

  if (!displayName) {
    return {
      accepted: false,
      status: 400,
      error: "displayName is required"
    };
  }

  if (!actorId) {
    return {
      accepted: false,
      status: 400,
      error: "actorId is required"
    };
  }

  const repository =
    dependencies.repository ?? new StaffEventsRepository();

  const event = buildEvent({
    eventId: (dependencies.newEventId ?? defaultEventId)(),
    staffId: (dependencies.newStaffId ?? defaultStaffId)(),
    type: "staff.created",
    occurredAt:
      (dependencies.now ?? (() => new Date().toISOString()))(),
    actorId,
    data: {
      displayName,
      roleLabel: normalizeOptionalText(input.roleLabel) ?? null,
      status: "active"
    }
  });

  await (repository as StaffEventWriter).append(event);

  return {
    accepted: true,
    eventId: event.eventId,
    staffId: event.staffId,
    type: event.type
  };
}

export async function updateStaffIdentity(
  input: UpdateStaffIdentityInput,
  dependencies: StaffCommandDependencies = {}
): Promise<StaffCommandResult> {
  const staffId = normalizeRequiredText(input.staffId);
  const actorId = normalizeRequiredText(input.actorId);

  if (!staffId) {
    return {
      accepted: false,
      status: 400,
      error: "staffId is required"
    };
  }

  if (!actorId) {
    return {
      accepted: false,
      status: 400,
      error: "actorId is required"
    };
  }

  if (
    input.status !== undefined &&
    input.status !== "active" &&
    input.status !== "inactive"
  ) {
    return {
      accepted: false,
      status: 400,
      error: "status must be active or inactive"
    };
  }

  const displayName =
    input.displayName === undefined
      ? undefined
      : normalizeRequiredText(input.displayName);

  if (input.displayName !== undefined && !displayName) {
    return {
      accepted: false,
      status: 400,
      error: "displayName cannot be empty"
    };
  }

  const roleLabel = normalizeOptionalText(input.roleLabel);
  const reason = normalizeOptionalText(input.reason);

  const hasMutableField =
    displayName !== undefined ||
    roleLabel !== undefined ||
    input.status !== undefined;

  if (!hasMutableField) {
    return {
      accepted: false,
      status: 400,
      error: "At least one mutable staff field is required"
    };
  }

  const repository =
    dependencies.repository ?? new StaffEventsRepository();

  const existing = await readCanonicalStaffIdentity(
    staffId,
    repository
  );

  if (!existing) {
    return {
      accepted: false,
      status: 404,
      error: "Staff identity not found"
    };
  }

  const type: StaffEventType =
    input.status === "inactive"
      ? "staff.deactivated"
      : "staff.updated";

  const data: StaffEventData =
    type === "staff.deactivated"
      ? {
          status: "inactive",
          reason: reason ?? null
        }
      : {
          ...(displayName !== undefined
            ? { displayName }
            : {}),
          ...(roleLabel !== undefined
            ? { roleLabel }
            : {}),
          ...(input.status !== undefined
            ? { status: input.status }
            : {}),
          ...(reason !== undefined
            ? { reason }
            : {})
        };

  const event = buildEvent({
    eventId: (dependencies.newEventId ?? defaultEventId)(),
    staffId,
    type,
    occurredAt:
      (dependencies.now ?? (() => new Date().toISOString()))(),
    actorId,
    data
  });

  await (repository as StaffEventWriter).append(event);

  return {
    accepted: true,
    eventId: event.eventId,
    staffId: event.staffId,
    type: event.type
  };
}
