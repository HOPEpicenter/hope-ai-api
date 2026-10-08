import {
  readCanonicalStaffIdentity,
  readMutationActorStaffIdentity
} from "../staff/readCanonicalStaffDirectory";

type StaffMutationActor = {
  staffId?: string | null;
  status?: string | null;
};

type StaffMutationActorReader = (
  staffId: string
) => Promise<StaffMutationActor | null>;

const STAFF_MUTATION_FORMATION_EVENT_TYPES = new Set([
  "FOLLOWUP_ASSIGNED",
  "FOLLOWUP_UNASSIGNED",
  "FOLLOWUP_CONTACTED",
  "FOLLOWUP_OUTCOME_RECORDED",
  "NEXT_STEP_SELECTED",
  "NEXT_STEP_COMPLETED"
]);

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function readHeader(req: any, name: string): string {
  const upperName = name.toUpperCase();

  return String(
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
    ""
  ).trim();
}

export type FormationMutationActorAuthorization =
  | {
      ok: true;
      actorId: string | null;
    }
  | {
      ok: false;
      status: 400 | 401 | 403;
      body: Record<string, unknown>;
    };

export function isStaffMutationFormationEventType(
  typeInput: unknown
): boolean {
  return STAFF_MUTATION_FORMATION_EVENT_TYPES.has(
    normalizeText(typeInput)
  );
}

export async function resolveFormationMutationActorAuthorization(
  req: any,
  typeInput: unknown,
  payloadActorIdInput: unknown,
  readActor: StaffMutationActorReader = readCanonicalStaffIdentity
): Promise<FormationMutationActorAuthorization> {
  if (!isStaffMutationFormationEventType(typeInput)) {
    return {
      ok: true,
      actorId: null
    };
  }

  const trustedActorId =
    readHeader(req, "x-hope-staff-actor-id");

  if (!trustedActorId) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: "Missing x-hope-staff-actor-id"
      }
    };
  }

  const payloadActorId =
    normalizeText(payloadActorIdInput);

  if (!payloadActorId) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error:
          "source.actorId is required for staff formation mutations"
      }
    };
  }

  if (payloadActorId !== trustedActorId) {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error:
          "source.actorId must match x-hope-staff-actor-id for staff formation mutations"
      }
    };
  }

  const actor =
    await readActor(trustedActorId);

  if (
    !actor ||
    actor.status !== "active" ||
    normalizeText(actor.staffId) !== trustedActorId
  ) {
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
    actorId: trustedActorId
  };
}

export async function requireActiveFormationMutationActor(
  typeInput: unknown,
  actorIdInput: unknown,
  readActor: StaffMutationActorReader = readMutationActorStaffIdentity
): Promise<StaffMutationActor | null> {
  if (!isStaffMutationFormationEventType(typeInput)) {
    return null;
  }

  const actorId = normalizeText(actorIdInput);

  if (!actorId) {
    throw new Error(
      "source.actorId is required for staff formation mutations"
    );
  }

  const actor =
    await readActor(actorId);

  if (!actor || actor.status !== "active") {
    throw new Error(
      "source.actorId must reference an active staff identity for staff formation mutations"
    );
  }

  return actor;
}
