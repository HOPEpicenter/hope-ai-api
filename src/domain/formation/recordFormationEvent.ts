// src/domain/formation/recordFormationEvent.ts
import crypto from "crypto";
import {
  FormationEventInput,
  FormationEventType,
  applyFormationDefaults,
  validateFormationEvent,
} from "./phase3_1_scope";
import { getFormationEventsTableClient, getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { FormationEventEntity } from "../../storage/formation/formationEventsRepo";
import {
  FormationProfileEntity,
  createDefaultFormationProfile,
  getFormationProfile,
  upsertFormationProfile,
} from "../../storage/formation/formationProfilesRepo";
import { insertFormationEvent } from "../../storage/formation/formationEventsRepo";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";

/**
 * NOTE: This service assumes you already have a Visitors table and a helper to verify visitor exists.
 * We'll wire that in Step 4 when we build the endpoint handlers (so we can reuse your Phase 1 code).
 *
 * For now, this function focuses on Formation data writes only.
 */

export type RecordFormationEventDeps = {
  storageConnectionString: string;
  // Optional hook to enforce "visitor must exist" using your Phase 1 storage
  ensureVisitorExists?: (visitorId: string) => Promise<void>;
};

export type RecordFormationEventResult = {
  eventRowKey: string;
  profile: FormationProfileEntity;
};

function nowIso() {
  return new Date().toISOString();
}

function makeRowKey(occurredAtIso: string) {
  // Sortable + unique: time + random suffix
  const suffix = crypto.randomBytes(6).toString("hex");
  return `${occurredAtIso}__${suffix}`;
}

function stringifyMetadata(metadata: unknown): string | undefined {
  if (metadata == null) return undefined;
  return JSON.stringify(metadata);
}

function applyProfileTouchpoint(profile: FormationProfileEntity, type: string, occurredAt: string, metadata: any) {
  switch (type) {
    case FormationEventType.SERVICE_ATTENDED:
      profile.lastServiceAttendedAt = occurredAt;
      break;

    case FormationEventType.FOLLOWUP_ASSIGNED:
      profile.lastFollowupAssignedAt = occurredAt;
      if (metadata?.assigneeId) profile.assignedTo = String(metadata.assigneeId);
      break;

    case FormationEventType.FOLLOWUP_CONTACTED:
      profile.lastFollowupContactedAt = occurredAt;
      break;

    case FormationEventType.NEXT_STEP_SELECTED:
    case FormationEventType.INFO_REQUESTED:
      profile.lastNextStepAt = occurredAt;
      break;

    case FormationEventType.PRAYER_REQUESTED:
      profile.lastPrayerRequestedAt = occurredAt;
      break;

    default:
      break;
  }
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

  // Optional: enforce visitor existence through Phase 1
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

  // Get or create profile
  let profile = await getFormationProfile(profilesTable, input.visitorId);
  if (!profile) {
    profile = createDefaultFormationProfile(input.visitorId);
  }

  // Create event entity (append-only)
  const rowKey = makeRowKey(occurredAt);

  const eventEntity: FormationEventEntity = {
    partitionKey: input.visitorId,
    rowKey,
    visitorId: input.visitorId,
    type: input.type,

    occurredAt,
    recordedAt,

    channel: input.channel ?? defaults.channel,
    visibility: input.visibility ?? defaults.visibility,
    sensitivity: input.sensitivity ?? defaults.sensitivity,

    summary: input.summary,
    metadata: stringifyMetadata(input.metadata),
    idempotencyKey: input.idempotencyKey,
  };

  // Write event
  await insertFormationEvent(eventsTable, eventEntity);

  // Update profile touchpoints (snapshot)
  applyProfileTouchpoint(profile, input.type, occurredAt, input.metadata);

  // Upsert profile (merge)
  await upsertFormationProfile(profilesTable, profile);

  return { eventRowKey: rowKey, profile };
}
