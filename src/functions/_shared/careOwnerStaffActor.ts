import type {
  CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import {
  canAssignCareOwner,
  canBeCareOwner
} from "../../services/authorization/pastoralAuthorization";
import {
  readCanonicalStaffIdentity
} from "../../services/staff/readCanonicalStaffDirectory";

type StaffIdentityReader = (
  staffId: string
) => Promise<CanonicalStaffIdentity | null>;

export type CareOwnerActorResult =
  | {
      ok: true;
      actor: CanonicalStaffIdentity;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export type CareOwnerAssigneeResult =
  | {
      ok: true;
      assignee: CanonicalStaffIdentity;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

function header(req: any, name: string): string {
  return String(
    (typeof req?.headers?.get === "function"
      ? req.headers.get(name)
      : null) ??
      req?.headers?.[name] ??
      req?.headers?.[name.toUpperCase()] ??
      req?.get?.(name) ??
      ""
  ).trim();
}

export async function requireCareOwnerActor(
  req: any,
  readIdentity: StaffIdentityReader = readCanonicalStaffIdentity
): Promise<CareOwnerActorResult> {
  const actorId = header(req, "x-hope-staff-actor-id");

  if (!actorId) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: "Missing x-hope-staff-actor-id"
      }
    };
  }

  const actor = await readIdentity(actorId);

  if (!actor || actor.status !== "active") {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error:
          "x-hope-staff-actor-id must reference an active canonical Staff identity"
      }
    };
  }

  if (!canAssignCareOwner(actor)) {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error:
          "Care Owner assignment requires pastoral authority"
      }
    };
  }

  return {
    ok: true,
    actor
  };
}

export async function requireCareOwnerAssignee(
  staffIdInput: string,
  readIdentity: StaffIdentityReader = readCanonicalStaffIdentity
): Promise<CareOwnerAssigneeResult> {
  const staffId = String(staffIdInput ?? "").trim();

  if (!staffId) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: "assignedTo is required"
      }
    };
  }

  const assignee = await readIdentity(staffId);

  if (
    !assignee ||
    assignee.status !== "active" ||
    !canBeCareOwner(assignee)
  ) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error:
          "assignedTo must reference an active Pastor or Ministry Leader"
      }
    };
  }

  return {
    ok: true,
    assignee
  };
}
