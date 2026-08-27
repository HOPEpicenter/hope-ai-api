import { randomUUID } from "crypto";
import {
  normalizeEntraStaffBinding,
  type StaffEvent,
  type StaffEventType
} from "../../domain/staff/projectStaffDirectory";
import { StaffEventsRepository } from "../../repositories/staffEventsRepository";
import {
  readCanonicalStaffIdentityByEntraBinding
} from "./readCanonicalStaffDirectory";

type StaffEventWriter = Pick<StaffEventsRepository, "append">;

export type MicrosoftStaffInvitation = {
  entraTenantId: string;
  entraObjectId: string;
};

export type StaffInvitationSender = (input: {
  displayName: string;
  email: string;
}) => Promise<MicrosoftStaffInvitation>;

export type CreateStaffInvitationInput = {
  displayName: string;
  email: string;
  roleLabel?: string | null;
  actorId: string;
};

export type StaffInvitationDependencies = {
  repository?: StaffEventsRepository;
  sendInvitation: StaffInvitationSender;
  now?: () => string;
  newEventId?: () => string;
  newStaffId?: () => string;
};

export type StaffInvitationResult =
  | {
      accepted: true;
      eventId: string;
      staffId: string;
      type: StaffEventType;
    }
  | {
      accepted: false;
      status: number;
      error: string;
    };

function normalizeRequiredText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value: unknown): string | null {
  return String(value ?? "").trim() || null;
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function defaultEventId(): string {
  return "evt-" + randomUUID().replace(/-/g, "");
}

function defaultStaffId(): string {
  return "staff-" + randomUUID().replace(/-/g, "");
}

export async function createStaffInvitation(
  input: CreateStaffInvitationInput,
  dependencies: StaffInvitationDependencies
): Promise<StaffInvitationResult> {
  const displayName = normalizeRequiredText(input.displayName);
  const email = normalizeEmail(input.email);
  const actorId = normalizeRequiredText(input.actorId);

  if (!displayName) {
    return {
      accepted: false,
      status: 400,
      error: "displayName is required"
    };
  }

  if (!isValidEmail(email)) {
    return {
      accepted: false,
      status: 400,
      error: "A valid email is required"
    };
  }

  if (!actorId) {
    return {
      accepted: false,
      status: 400,
      error: "actorId is required"
    };
  }

  let invitation: MicrosoftStaffInvitation;

  try {
    invitation = await dependencies.sendInvitation({ displayName, email });
  } catch {
    return {
      accepted: false,
      status: 502,
      error: "Microsoft invitation could not be sent"
    };
  }

  const binding = normalizeEntraStaffBinding(
    invitation.entraTenantId,
    invitation.entraObjectId
  );

  if (!binding) {
    return {
      accepted: false,
      status: 502,
      error: "Microsoft invitation returned an invalid Staff identity"
    };
  }

  const repository =
    dependencies.repository ?? new StaffEventsRepository();

  const existing = await readCanonicalStaffIdentityByEntraBinding(
    binding.entraTenantId,
    binding.entraObjectId,
    repository
  );

  if (existing) {
    return {
      accepted: false,
      status: 409,
      error: "Microsoft identity is already bound to a Staff identity"
    };
  }

  const event: StaffEvent = {
    eventId: (dependencies.newEventId ?? defaultEventId)(),
    staffId: (dependencies.newStaffId ?? defaultStaffId)(),
    type: "staff.invited",
    occurredAt:
      (dependencies.now ?? (() => new Date().toISOString()))(),
    actorId,
    data: {
      displayName,
      roleLabel: normalizeOptionalText(input.roleLabel),
      status: "pending",
      ...binding
    }
  };

  await (repository as StaffEventWriter).append(event);

  return {
    accepted: true,
    eventId: event.eventId,
    staffId: event.staffId,
    type: event.type
  };
}
