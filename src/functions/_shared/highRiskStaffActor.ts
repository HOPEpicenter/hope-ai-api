import type {
  CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import {
  canViewHighRiskAlerts
} from "../../services/authorization/pastoralAuthorization";
import {
  readCanonicalStaffIdentity
} from "../../services/staff/readCanonicalStaffDirectory";

type StaffIdentityReader = (
  staffId: string
) => Promise<CanonicalStaffIdentity | null>;

export type HighRiskStaffActorResult =
  | {
      ok: true;
      actor: CanonicalStaffIdentity;
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

export async function requireHighRiskStaffActor(
  req: any,
  readIdentity: StaffIdentityReader = readCanonicalStaffIdentity
): Promise<HighRiskStaffActorResult> {
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

  if (!canViewHighRiskAlerts(actor)) {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error:
          "Pastoral risk visibility requires pastoral authority"
      }
    };
  }

  return {
    ok: true,
    actor
  };
}
