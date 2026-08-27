import { randomUUID } from "crypto";
import {
  normalizeEntraStaffBinding,
  type StaffEvent
} from "../../domain/staff/projectStaffDirectory";
import { StaffEventsRepository } from "../../repositories/staffEventsRepository";
import {
  readCanonicalStaffIdentityByEntraBinding
} from "./readCanonicalStaffDirectory";

type StaffEventWriter = Pick<StaffEventsRepository, "append">;

export type ActivateStaffInvitationInput = {
  entraTenantId: string;
  entraObjectId: string;
};

export type ActivateStaffInvitationDependencies = {
  repository?: StaffEventsRepository;
  now?: () => string;
  newEventId?: () => string;
};

export type ActivateStaffInvitationResult =
  | {
      accepted: true;
      staffId: string;
      eventId: string | null;
      activated: boolean;
    }
  | {
      accepted: false;
      status: number;
      error: string;
    };

function defaultEventId(): string {
  return "evt-" + randomUUID().replace(/-/g, "");
}

export async function activateStaffInvitation(
  input: ActivateStaffInvitationInput,
  dependencies: ActivateStaffInvitationDependencies = {}
): Promise<ActivateStaffInvitationResult> {
  const binding = normalizeEntraStaffBinding(
    input.entraTenantId,
    input.entraObjectId
  );

  if (!binding) {
    return {
      accepted: false,
      status: 400,
      error: "entraTenantId and entraObjectId must be valid GUIDs"
    };
  }

  const repository =
    dependencies.repository ?? new StaffEventsRepository();

  const staff = await readCanonicalStaffIdentityByEntraBinding(
    binding.entraTenantId,
    binding.entraObjectId,
    repository
  );

  if (!staff) {
    return {
      accepted: false,
      status: 404,
      error: "Canonical Staff Identity not found"
    };
  }

  if (staff.status === "active") {
    return {
      accepted: true,
      staffId: staff.staffId,
      eventId: null,
      activated: false
    };
  }

  if (staff.status !== "pending") {
    return {
      accepted: false,
      status: 403,
      error: "Only pending Staff invitations can be activated"
    };
  }

  const event: StaffEvent = {
    eventId: (dependencies.newEventId ?? defaultEventId)(),
    staffId: staff.staffId,
    type: "staff.activated",
    occurredAt:
      (dependencies.now ?? (() => new Date().toISOString()))(),
    actorId: staff.staffId,
    data: {
      status: "active"
    }
  };

  await (repository as StaffEventWriter).append(event);

  return {
    accepted: true,
    staffId: staff.staffId,
    eventId: event.eventId,
    activated: true
  };
}
