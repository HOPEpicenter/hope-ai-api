import { FormationEventInput } from "./phase3_1_scope";
import {
  FormationProfileEntity,
  FORMATION_PROFILES_PARTITION_KEY,
  getFormationProfileEntity,
  upsertFormationProfileEntity,
} from "../../storage/formation/formationProfileStore";

function nowIso() {
  return new Date().toISOString();
}

function coalesceIso(input?: string): string {
  // if caller didn't send occurredAt, recordFormationEvent usually stamps it,
  // but this keeps projector safe if used elsewhere
  return (typeof input === "string" && input.trim()) ? input : nowIso();
}

function normalizeStageFromEvent(type: string, existingStage?: string | null): string {
  // Phase 3.2 minimal mapping (safe defaults).
  // You can evolve later without breaking storage shape.
  switch (type) {
    case "PRAYER_REQUESTED":
      return existingStage ?? "CONNECTED";
    case "SERVICE_ATTENDED":
      return existingStage ?? "CONNECTED";
    case "FOLLOWUP_ASSIGNED":
      return existingStage ?? "CONNECTED";
    case "FOLLOWUP_CONTACTED":
      return existingStage ?? "CONNECTED";
    case "FOLLOWUP_OUTCOME_RECORDED":
      return existingStage ?? "CONNECTED";
    case "NEXT_STEP_SELECTED":
      return existingStage ?? "CONNECTED";
    case "INFO_REQUESTED":
      return existingStage ?? "CONNECTED";
    default:
      return existingStage ?? "UNKNOWN";
  }
}

export async function projectFormationProfileFromEvent(input: FormationEventInput, opts: {
  storageConnectionString: string;
}): Promise<FormationProfileEntity> {
  const { storageConnectionString } = opts;

  const visitorId = input.visitorId;
  const occurredAt = coalesceIso(input.occurredAt);

  const existing = await getFormationProfileEntity(storageConnectionString, visitorId);

  const stage = normalizeStageFromEvent(input.type, existing?.stage ?? null);

  let assignedTo: string | null | undefined = existing?.assignedTo ?? null;
  let lastFollowupAssignedAt: string | null | undefined = existing?.lastFollowupAssignedAt ?? null;

  // Type-specific projection (Phase 3.2 scope)
  if (input.type === "FOLLOWUP_ASSIGNED") {
    const md: any = input.metadata ?? {};
    if (typeof md.assigneeId === "string" && md.assigneeId.trim()) {
      assignedTo = md.assigneeId.trim();
    }
    lastFollowupAssignedAt = occurredAt;
  }

  const entity: FormationProfileEntity = {
    partitionKey: FORMATION_PROFILES_PARTITION_KEY,
    rowKey: visitorId,
    visitorId,

    stage,
    assignedTo: assignedTo ?? null,

    lastEventType: input.type,
    lastEventAt: occurredAt,

    lastFollowupAssignedAt: lastFollowupAssignedAt ?? null,
    updatedAt: nowIso(),
  };

  await upsertFormationProfileEntity(storageConnectionString, entity);

  // Return the merged view (entity already includes important fields)
  return entity;
}
