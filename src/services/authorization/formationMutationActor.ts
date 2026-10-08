import { readMutationActorStaffIdentity } from "../staff/readCanonicalStaffDirectory";

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

export function isStaffMutationFormationEventType(
  typeInput: unknown
): boolean {
  return STAFF_MUTATION_FORMATION_EVENT_TYPES.has(
    normalizeText(typeInput)
  );
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
