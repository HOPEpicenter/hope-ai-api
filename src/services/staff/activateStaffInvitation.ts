import { randomUUID } from "crypto";
import {
  normalizeEntraStaffBinding,
  type StaffEvent
} from "../../domain/staff/projectStaffDirectory";
import { StaffEventsRepository } from "../../repositories/staffEventsRepository";
import {
  classifyStaffWriterTransition
} from "../../domain/staff/classifyStaffWriterTransition";
import type {
  StaffScopedAtomicResult
} from "../../repositories/staffScopedAtomicDeactivation";
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
  /**
   * Default legacy compatibility; explicit migration modes
   * deny legacy writes. No production activation authority.
   */
  transitionMode?: unknown;

  /**
   * Default-off, injected atomic participation.
   * Does not authorize OAuth execution.
   */
  atomicMutationEnabled?: boolean;
  atomicMutation?: (
    event: StaffEvent
  ) => Promise<StaffScopedAtomicResult>;

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

  const transition = classifyStaffWriterTransition({
    category: "invitation_activation",
    mode: dependencies.transitionMode
  });

  if (!transition.legacyAppendEligible) {
    return {
      accepted: false,
      status: 503,
      error: "Staff activation legacy writer is unavailable"
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

  if (dependencies.atomicMutationEnabled === true) {
    // The selected atomic path must not retry or fall back
    // to legacy append after any failed or uncertain result.
    if (typeof dependencies.atomicMutation !== "function") {
      return {
        accepted: false,
        status: 503,
        error: "Atomic Staff activation writer unavailable"
      };
    }

    let decision: StaffScopedAtomicResult;

    try {
      decision = await dependencies.atomicMutation(event);
    } catch {
      return {
        accepted: false,
        status: 503,
        error: "Atomic Staff activation outcome uncertain"
      };
    }

    if (
      !decision ||
      decision.executionPermitted !== false ||
      decision.retryPermitted !== false ||
      decision.productionWriterFenced !== false
    ) {
      return {
        accepted: false,
        status: 503,
        error: "Atomic Staff activation result invalid"
      };
    }

    if (decision.status === "denied") {
      return {
        accepted: false,
        status: 409,
        error: "Atomic Staff activation denied"
      };
    }

    if (decision.status !== "committed") {
      return {
        accepted: false,
        status: 503,
        error: "Atomic Staff activation outcome uncertain"
      };
    }

    // Canonical event already acknowledged by atomic writer.
    // No duplicate append and no OAuth authorization granted.
    return {
      accepted: true,
      staffId: staff.staffId,
      eventId: event.eventId,
      activated: true
    };
  }

  await (repository as StaffEventWriter).append(event);

  return {
    accepted: true,
    staffId: staff.staffId,
    eventId: event.eventId,
    activated: true
  };
}
