import type {
  CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import {
  readCanonicalStaffIdentity
} from "../../services/staff/readCanonicalStaffDirectory";
import {
  resolveSixWeekAdministrativeOverride,
  type SixWeekAdministrativeOverride
} from "./adminStaffActor";

type StaffIdentityReader = (
  staffId: string
) => Promise<CanonicalStaffIdentity | null>;

export type SixWeekActorAuthorization =
  | {
      ok: true;
      actorId: string;
      administrativeOverrideVerified?: true;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

function readHeader(req: any, name: string): string {
  const upperName = name.toUpperCase();

  const value =
    (typeof req?.headers?.get === "function"
      ? req.headers.get(name)
      : null) ??
    (typeof req?.headers?.get === "function"
      ? req.headers.get(upperName)
      : null) ??
    req?.headers?.[name] ??
    req?.headers?.[upperName] ??
    req?.get?.(name) ??
    req?.get?.(upperName) ??
    "";

  return String(value ?? "").trim();
}

export async function resolveSixWeekActorAuthorization(
  req: any,
  readIdentity: StaffIdentityReader = readCanonicalStaffIdentity,
  resolveAdminOverride: (
    req: any,
    reader?: any
  ) => Promise<SixWeekAdministrativeOverride> = resolveSixWeekAdministrativeOverride
): Promise<SixWeekActorAuthorization> {
  const administrativeOverride = await resolveAdminOverride(
    req,
    readIdentity
  );

  if (!administrativeOverride.ok) {
    return administrativeOverride;
  }

  if (administrativeOverride.administrativeOverrideVerified === true) {
    return {
      ok: true,
      actorId: administrativeOverride.actorId!,
      administrativeOverrideVerified: true
    };
  }

  const actorId = readHeader(req, "x-hope-staff-actor-id");

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

  return {
    ok: true,
    actorId: actor.staffId
  };
}
