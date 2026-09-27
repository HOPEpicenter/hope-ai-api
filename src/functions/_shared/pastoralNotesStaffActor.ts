import type {
  CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import {
  canViewPastoralNotes,
  canWritePastoralNotes
} from "../../services/authorization/pastoralAuthorization";
import {
  readCanonicalStaffIdentity
} from "../../services/staff/readCanonicalStaffDirectory";

type PastoralNotesCapability = "view" | "write";

type StaffIdentityReader = (
  staffId: string
) => Promise<CanonicalStaffIdentity | null>;

export type PastoralNotesStaffActorResult =
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

export async function requirePastoralNotesStaffActor(
  req: any,
  capability: PastoralNotesCapability,
  readIdentity: StaffIdentityReader = readCanonicalStaffIdentity
): Promise<PastoralNotesStaffActorResult> {
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

  const allowed =
    capability === "view"
      ? canViewPastoralNotes(actor)
      : canWritePastoralNotes(actor);

  if (!allowed) {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error: "Pastoral Notes access requires pastoral authority"
      }
    };
  }

  return {
    ok: true,
    actor
  };
}
