import { randomUUID } from "crypto";
import type {
  StaffEvent,
  StaffEventData,
  StaffEventType
} from "../../domain/staff/projectStaffDirectory";
import { normalizeEntraStaffBinding } from "../../domain/staff/projectStaffDirectory";
import type {
  StaffStatus
} from "../operators/operatorIdentity";
import { StaffEventsRepository } from "../../repositories/staffEventsRepository";
import {
  readCanonicalStaffIdentity,
  readCanonicalStaffIdentityByEntraBinding
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
  entraTenantId?: string | null;
  entraObjectId?: string | null;
};

export type UpdateStaffIdentityInput = {
  staffId: string;
  displayName?: string;
  roleLabel?: string | null;
  status?: StaffStatus;
  reason?: string | null;
  actorId: string;
  entraTenantId?: string | null;
  entraObjectId?: string | null;
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

function hasEntraBindingInput(input: {
  entraTenantId?: string | null;
  entraObjectId?: string | null;
}): boolean {
  return input.entraTenantId !== undefined || input.entraObjectId !== undefined;
}

function validateEntraBinding(input: {
  entraTenantId?: string | null;
  entraObjectId?: string | null;
}):
  | { ok: true; binding: { entraTenantId: string; entraObjectId: string } | null }
  | { ok: false; error: string } {
  if (!hasEntraBindingInput(input)) {
    return { ok: true, binding: null };
  }

  if (
    input.entraTenantId === undefined || input.entraTenantId === null ||
    input.entraObjectId === undefined || input.entraObjectId === null
  ) {
    return {
      ok: false,
      error: "entraTenantId and entraObjectId must be provided together"
    };
  }

  const binding = normalizeEntraStaffBinding(
    input.entraTenantId,
    input.entraObjectId
  );

  return binding
    ? { ok: true, binding }
    : { ok: false, error: "entraTenantId and entraObjectId must be valid GUIDs" };
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

  const entraBindingResult = validateEntraBinding(input);

  if (!entraBindingResult.ok) {
    return { accepted: false, status: 400, error: entraBindingResult.error };
  }

  const repository =
    dependencies.repository ?? new StaffEventsRepository();

  if (entraBindingResult.binding) {
    const existingBinding = await readCanonicalStaffIdentityByEntraBinding(
      entraBindingResult.binding.entraTenantId,
      entraBindingResult.binding.entraObjectId,
      repository
    );

    if (existingBinding) {
      return {
        accepted: false,
        status: 409,
        error: "Entra identity is already bound to a staff identity"
      };
    }
  }

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
      status: "active",
      ...(entraBindingResult.binding ?? {})
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
  const entraBindingResult = validateEntraBinding(input);

  if (!entraBindingResult.ok) {
    return { accepted: false, status: 400, error: entraBindingResult.error };
  }

  const hasMutableField =
    displayName !== undefined ||
    roleLabel !== undefined ||
    input.status !== undefined ||
    hasEntraBindingInput(input);

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

  if (input.status === "inactive" && entraBindingResult.binding) {
    return {
      accepted: false,
      status: 400,
      error: "Entra identity cannot be rebound while deactivating staff"
    };
  }

  if (entraBindingResult.binding) {
    const existingBinding = await readCanonicalStaffIdentityByEntraBinding(
      entraBindingResult.binding.entraTenantId,
      entraBindingResult.binding.entraObjectId,
      repository
    );

    if (existingBinding && existingBinding.staffId !== staffId) {
      return {
        accepted: false,
        status: 409,
        error: "Entra identity is already bound to a staff identity"
      };
    }
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
            : {}),
          ...(entraBindingResult.binding ?? {})
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
