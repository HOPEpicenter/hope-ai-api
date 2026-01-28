import crypto from "crypto";
import {
  FormationEventInput,
  FormationEventType,
  FormationStage,
  applyFormationDefaults,
  validateFormationEvent,
} from "./phase3_1_scope";
import {
  getFormationEventsTableClient,
  getFormationProfilesTableClient,
} from "../../storage/formation/formationTables";
import {
  FormationEventEntity,
  insertFormationEvent,
} from "../../storage/formation/formationEventsRepo";
import {
  FormationProfileEntity,
  createDefaultFormationProfile,
  getFormationProfile,
  upsertFormationProfile,
} from "../../storage/formation/formationProfilesRepo";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";

/**
 * Formation event recorder (Phase 3)
 * - Append-only events
 * - Snapshot updates on FormationProfile
 * - Deterministic, non-downgrading stage progression
 *
 * IMPORTANT CONTRACT (Ops Dashboard):
 * - FormationProfile must be stored at canonical keys:
 *    PartitionKey = "VISITOR"
 *    RowKey = visitorId
 * - FormationProfile must include snapshot fields:
 *    lastEventType, lastEventAt, updatedAt
 */

export type RecordFormationEventDeps = {
  storageConnectionString: string;
  ensureVisitorExists?: (visitorId: string) => Promise<void>;
};

export type RecordFormationEventResult = {
  eventRowKey: string;
  profile: FormationProfileEntity;
};

function nowIso(): string {
  return new Date().toISOString();
}

function makeRowKey(occurredAtIso: string, eventId?: string): string {
  // Stable RowKey when client supplies an id/idempotencyKey
  const stable = String(eventId ?? "").trim();
  if (stable) return `${occurredAtIso}__${stable}`;

  const suffix = crypto.randomBytes(6).toString("hex");
  return `${occurredAtIso}__${suffix}`;
}

function stringifyMetadata(metadata: unknown): string | undefined {
  if (metadata == null) return undefined;
  return JSON.stringify(metadata);
}

/**
 * Stage progression rules (PILOT)
 * Valid stages: Visitor | Guest | Connected
 * - Never downgrade
 * - FOLLOWUP_CONTACTED does NOT advance stage
 * - NEXT_STEP_SELECTED advances to Connected
 * - FOLLOWUP_OUTCOME_RECORDED advances to Connected for positive outcomes
 */
const STAGE_RANK: Record<FormationStage, number> = {
  Visitor: 0,
  Guest: 1,
  Connected: 2,
};

function normalizeStage(value: unknown): FormationStage {
  const s = String(value ?? "").trim();
  return s === "Visitor" || s === "Guest" || s === "Connected"
    ? (s as FormationStage)
    : "Visitor";
}

function maxStage(a: FormationStage, b: FormationStage): FormationStage {
  return STAGE_RANK[a] >= STAGE_RANK[b] ? a : b;
}

function computeNextStage(
  currentStage: unknown,
  eventType: string,
  metadata: any
): FormationStage {
  const current = normalizeStage(currentStage);

  switch (eventType) {
    case FormationEventType.FOLLOWUP_ASSIGNED:
      // When staff takes ownership, treat as an active Guest (no downgrade)
      return maxStage(current, "Guest");

    case FormationEventType.NEXT_STEP_SELECTED:
      return maxStage(current, "Connected");

    case FormationEventType.FOLLOWUP_OUTCOME_RECORDED: {
      const outcome = String(metadata?.outcome ?? "").toUpperCase().trim();
      const CONNECTED_OUTCOMES = new Set([
        "CONNECTED",
        "WILL_VISIT",
        "VISITING",
        "ATTENDING",
        "NEXT_STEP_TAKEN",
        "JOINED_GROUP",
        "MEMBER_CLASS",
        "BAPTISM_CLASS",
      ]);
      return CONNECTED_OUTCOMES.has(outcome)
        ? maxStage(current, "Connected")
        : current;
    }

    default:
      return current;
  }
}

function applyProfileTouchpoint(
  profile: FormationProfileEntity,
  type: string,
  occurredAt: string,
  metadata: any
): void {
  switch (type) {
    case FormationEventType.SERVICE_ATTENDED:
      (profile as any).lastServiceAttendedAt = occurredAt;
      break;

    case FormationEventType.FOLLOWUP_ASSIGNED:
      (profile as any).lastFollowupAssignedAt = occurredAt;
      if (metadata?.assigneeId) (profile as any).assignedTo = String(metadata.assigneeId);
      break;

    case FormationEventType.FOLLOWUP_CONTACTED:
      (profile as any).lastFollowupContactedAt = occurredAt;
      break;

    case FormationEventType.FOLLOWUP_OUTCOME_RECORDED:
      // needed so queue can tell an outcome was recorded
      (profile as any).lastFollowupOutcomeAt = occurredAt;
      break;

    case FormationEventType.NEXT_STEP_SELECTED:
    case FormationEventType.INFO_REQUESTED:
      (profile as any).lastNextStepAt = occurredAt;
      break;

    case FormationEventType.PRAYER_REQUESTED:
      (profile as any).lastPrayerRequestedAt = occurredAt;
      break;

    default:
      break;
  }

  // Stage progression (deterministic, no downgrade)
  const nextStage = computeNextStage((profile as any).stage, String(type ?? ""), metadata);
  if (nextStage !== (profile as any).stage) {
    (profile as any).stage = nextStage;
    (profile as any).stageUpdatedAt = occurredAt;
    (profile as any).stageUpdatedBy = "system";
    (profile as any).stageReason = `event:${String(type ?? "")}`;
  }
}

/**
 * ENFORCE CANONICAL PROFILE KEYS
 * Ops dashboard expects: PK="VISITOR", RK=visitorId
 */
function enforceProfileKeys(profile: FormationProfileEntity, visitorId: string): FormationProfileEntity {
  (profile as any).visitorId = visitorId;

  // Force canonical keys for storage + dashboard lookups
  (profile as any).partitionKey = "VISITOR";
  (profile as any).rowKey = visitorId;

  return profile;
}

export async function recordFormationEvent(
  input: FormationEventInput,
  deps: RecordFormationEventDeps
): Promise<RecordFormationEventResult> {
  const valid = validateFormationEvent(input);
  if (!valid.ok) {
    const err = new Error(valid.error);
    (err as any).statusCode = 400;
    throw err;
  }

  if (deps.ensureVisitorExists) {
    await deps.ensureVisitorExists(input.visitorId);
  }

  const occurredAt = input.occurredAt ?? nowIso();
  const recordedAt = nowIso();
  const defaults = applyFormationDefaults(input);

  const eventsTable = getFormationEventsTableClient(deps.storageConnectionString);
  const profilesTable = getFormationProfilesTableClient(deps.storageConnectionString);
  await ensureTableExists(eventsTable);
  await ensureTableExists(profilesTable);

  let profile = await getFormationProfile(profilesTable, input.visitorId);
  if (!profile) {
    profile = createDefaultFormationProfile(input.visitorId);
  }

  // ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Guarantee PK/RK alignment with Ops dashboard expectations
  profile = enforceProfileKeys(profile, input.visitorId);

    const clientId = String((input as any).id ?? (input as any).idempotencyKey ?? (input as any).idempotency_key ?? "").trim();
  const eventId = clientId || crypto.randomUUID();
  const rowKey = makeRowKey(occurredAt, eventId);

  const eventEntity: FormationEventEntity = {
    partitionKey: input.visitorId,
    rowKey,
    id: eventId,
    visitorId: input.visitorId,
    type: input.type,
    occurredAt,
    recordedAt,
    channel: input.channel ?? defaults.channel,
    visibility: input.visibility ?? defaults.visibility,
    sensitivity: input.sensitivity ?? defaults.sensitivity,
    summary: input.summary,
    metadata: stringifyMetadata(input.metadata),
    idempotencyKey: clientId || input.idempotencyKey,
  };

  // Idempotency: if client supplied id/idempotencyKey and we've already stored this event, return early.
  // IMPORTANT: do not re-apply profile touchpoints on retry.
  if (clientId) {
    const safePk = String(input.visitorId ?? "").replace(/'/g, "''");
    const safeId = String(eventId ?? "").replace(/'/g, "''");
    const filter = `PartitionKey eq '${safePk}' and id eq '${safeId}'`;

    for await (const existing of eventsTable.listEntities<any>({ queryOptions: { filter } })) {
      const existingRowKey = String((existing as any).rowKey ?? (existing as any).RowKey ?? "");
      return { eventRowKey: existingRowKey || rowKey, profile };
    }
  }
  await insertFormationEvent(eventsTable, eventEntity);

  // Update snapshot based on the event
  applyProfileTouchpoint(profile, input.type, occurredAt, input.metadata);

  // ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Snapshot fields Ops dashboard should rely on (always set)
  (profile as any).lastEventType = input.type;
  (profile as any).lastEventAt = occurredAt;
  (profile as any).updatedAt = recordedAt;

  // Write snapshot (Merge semantics are handled in repo)
  await upsertFormationProfile(profilesTable, profile);

  return { eventRowKey: rowKey, profile };
}
