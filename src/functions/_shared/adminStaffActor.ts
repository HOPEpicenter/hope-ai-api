import {
  readCanonicalStaffIdentity
} from "../../services/staff/readCanonicalStaffDirectory";
import {
  requireAdminApiKeyForFunction
} from "./adminApiKey";

type CanonicalStaffReader = typeof readCanonicalStaffIdentity;

export type RequiredAdminStaffActor =
  | { ok: true; actorId: string }
  | { ok: false; status: number; body: Record<string, unknown> };

export type SixWeekAdministrativeOverride =
  | {
      ok: true;
      actorId: string | null;
      administrativeOverrideVerified?: true;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

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

function configuredAdministratorStaffIds(): Set<string> {
  return new Set(
    String(process.env.HOPE_ADMIN_STAFF_IDS ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
  );
}

export async function requireAdminStaffActorForFunction(
  req: any,
  readStaffIdentity: CanonicalStaffReader = readCanonicalStaffIdentity
): Promise<RequiredAdminStaffActor> {
  const apiKeyAuth = requireAdminApiKeyForFunction(req);

  if (!apiKeyAuth.ok) {
    return apiKeyAuth;
  }

  const administratorStaffIds = configuredAdministratorStaffIds();

  if (administratorStaffIds.size === 0) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        error: "Server missing HOPE_ADMIN_STAFF_IDS"
      }
    };
  }

  const actorId = readHeader(req, "x-hope-admin-actor-id");

  if (!actorId) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: "Missing x-hope-admin-actor-id"
      }
    };
  }

  if (!administratorStaffIds.has(actorId)) {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error: "Only configured ministry administrators can manage Staff identities"
      }
    };
  }

  const actor = await readStaffIdentity(actorId);

  if (!actor || actor.status !== "active") {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error: "Administrative Staff identity must be active"
      }
    };
  }

  return { ok: true, actorId: actor.staffId };
}

export async function resolveSixWeekAdministrativeOverride(
  req: any,
  readStaffIdentity: CanonicalStaffReader = readCanonicalStaffIdentity
): Promise<SixWeekAdministrativeOverride> {
  const hasAdministrativeHeaders =
    Boolean(readHeader(req, "x-admin-api-key")) ||
    Boolean(readHeader(req, "x-hope-admin-actor-id"));

  if (!hasAdministrativeHeaders) {
    return { ok: true, actorId: null };
  }

  const administrator = await requireAdminStaffActorForFunction(
    req,
    readStaffIdentity
  );

  if (!administrator.ok) {
    return administrator;
  }

  return {
    ok: true,
    actorId: administrator.actorId,
    administrativeOverrideVerified: true
  };
}
