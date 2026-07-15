import { compareTimelineNewestFirst } from "../../shared/timeline/timelineOrdering";
import { TableClient } from "@azure/data-tables";
import { GlobalTimelineRepository } from "../../repositories/globalTimelineRepository";
import { logFunctionError } from "../../shared/observability/functionObservability";
import { getConnString } from "./tableClient";
import { getVisitorById } from "./visitorsRepository";
import { resolveMutationSource } from "../../services/events/resolveMutationSource";
import {
  compareEventOrder,
  shouldAdvanceEventState,
  shouldAdvanceTouchpointAt
} from "./reconciliation";
import {
  toComparableFormationProfileState
} from "../../domain/formation/projection/comparableFormationProfile";
import {
  applyStageTransition
} from "../../domain/formation/projection/applyStageTransition";
import {
  applyTouchpointTimestamp
} from "../../domain/formation/projection/applyTouchpointTimestamp";
import {
  formationMutationDispatchers
} from "../../domain/formation/projection/formationMutationDispatchers";
import {
  readMutationActorStaffIdentity
} from "../../services/staff/readCanonicalStaffDirectory";

function normalizeAssignedTo(input: any): string | null {
  if (input === null || input === undefined) return null;

  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}


export type FunctionFormationEventEntity = {
  partitionKey: string;
  rowKey: string;
  visitorId: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
  channel?: string;
  visibility?: string;
  sensitivity?: string;
  summary?: string;
  metadata?: string;
  idempotencyKey?: string;
};

export type FunctionFormationProfileEntity = {
  partitionKey: "VISITOR";
  rowKey: string;
  visitorId: string;
  stage?: string;
  stageUpdatedAt?: string;
  stageUpdatedBy?: string;
  stageReason?: string;
  stageEventId?: string;
  assignedTo?: string | null;
  lastEventType?: string;
  lastEventAt?: string;
  lastActorId?: string | null;
  updatedAt?: string;
  lastServiceAttendedAt?: string;
  lastFollowupAssignedAt?: string;
  lastFollowupContactedAt?: string;
  lastFollowupOutcomeAt?: string;
  lastFollowupOutcome?: string;
  lastFollowupOutcomeNotes?: string;
  lastNextStepAt?: string;
  lastNextStepCompletedAt?: string;
  lastPrayerRequestedAt?: string;
  displayName?: string;
  groupsJson?: string;
  [k: string]: any;
};

const FORMATION_EVENTS_TABLE = process.env.FORMATION_EVENTS_TABLE || "devFormationEvents";
const FORMATION_PROFILES_TABLE = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";

function escapeOData(value: string): string {
  return String(value ?? "").replace(/'/g, "''");
}

function normalizeIso(value: unknown, fieldName: string): string {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(fieldName + " is required");
  }

  const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/;
  if (!isoUtcPattern.test(text)) {
    throw new Error(fieldName + " must be a valid UTC ISO timestamp ending in Z");
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(fieldName + " must be a valid ISO timestamp");
  }

  return parsed.toISOString();
}

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, any>;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(fieldName + " is required");
  }
  return text;
}

function normalizeOptionalActorId(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value).trim();

  if (!text || text.length > 128) {
    throw new Error("source.actorId must be a string (1-128 chars) if provided");
  }

  return text;
}

function serializeGroups(entity: any): any {
  if (Array.isArray(entity?.groups)) {
    const { groups, ...rest } = entity;
    return {
      ...rest,
      groupsJson: JSON.stringify(groups),
    };
  }

  return entity;
}

function deserializeGroups(entity: any): any {
  if (entity && typeof entity.groupsJson === "string") {
    try {
      return {
        ...entity,
        groups: JSON.parse(entity.groupsJson),
      };
    } catch {
      return {
        ...entity,
        groups: [],
      };
    }
  }

  return entity;
}

const SUPPORTED_FORMATION_EVENT_TYPES = new Set([
  "FOLLOWUP_ASSIGNED",
  "FOLLOWUP_UNASSIGNED",
  "FOLLOWUP_CONTACTED",
  "FOLLOWUP_OUTCOME_RECORDED",
  "NEXT_STEP_SELECTED",
  "NEXT_STEP_COMPLETED",
  "PRAYER_REQUESTED",
  "SALVATION_RECORDED",
  "BAPTISM_RECORDED",
  "MEMBERSHIP_RECORDED",
  "GROUP_JOINED",
  "GROUP_LEFT",
]);

const OPERATOR_MUTATION_EVENT_TYPES = new Set([
  "FOLLOWUP_ASSIGNED",
  "FOLLOWUP_UNASSIGNED",
  "FOLLOWUP_CONTACTED",
  "FOLLOWUP_OUTCOME_RECORDED"
]);

function validateFormationEventEnvelopeV1Strict(body: unknown): {
  v: number;
  eventId: string;
  visitorId: string;
  type: string;
  occurredAt: string;
  source: Record<string, any>;
  data: Record<string, any>;
} {
  const obj = asObject(body);

  const v = Number(obj.v);
  if (v !== 1) {
    throw new Error("v must be 1");
  }

  const eventId = requireNonEmptyString(obj.eventId, "eventId");
  const visitorId = requireNonEmptyString(obj.visitorId, "visitorId");
  const type = requireNonEmptyString(obj.type, "type");
  if (!SUPPORTED_FORMATION_EVENT_TYPES.has(type)) {
    throw new Error("type must be one of: " + Array.from(SUPPORTED_FORMATION_EVENT_TYPES).join(", "));
  }
  const occurredAt = requireNonEmptyString(obj.occurredAt, "occurredAt");

  const source = asObject(obj.source);
  const sourceSystem = requireNonEmptyString(source.system, "source.system");
  const actorId = normalizeOptionalActorId(source.actorId);

  const data = asObject(obj.data);

  if (OPERATOR_MUTATION_EVENT_TYPES.has(type) && !actorId) {
    throw new Error("source.actorId is required for operator followup mutations");
  }


  if (type === "FOLLOWUP_ASSIGNED") {
    requireNonEmptyString(data.assigneeId, "data.assigneeId");
  }

  if (type === "NEXT_STEP_SELECTED" || type === "NEXT_STEP_COMPLETED") {
    requireNonEmptyString(data.nextStep, "data.nextStep");
  }

  if (type === "GROUP_JOINED" || type === "GROUP_LEFT") {
    requireNonEmptyString(data.groupId, "data.groupId");
  }

  return {
    v,
    eventId,
    visitorId,
    type,
    occurredAt,
    source: {
      ...source,
      system: sourceSystem,
      ...(actorId ? { actorId } : {})
    },
    data
  };
}

function buildEventRowKey(occurredAtIso: string, eventId: string): string {
  return occurredAtIso + "__" + String(eventId).trim();
}



function maybeSetStage(
  profile: FunctionFormationProfileEntity,
  stage: string,
  occurredAtIso: string,
  eventType: string,
  eventId: string
): void {
  applyStageTransition({
    profile: profile as any,
    stage,
    occurredAtIso,
    eventType,
    eventId
  });
}


function toComparableProfileState(profile: FunctionFormationProfileEntity | null): string {
  return toComparableFormationProfileState(profile as any);
}

function logFormationEventDecision(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({
    level: "info",
    operation: "recordFormationEventV1",
    ...payload
  }));
}

export function toFormationHttpError(error: any, fallbackStatus = 400): number {
  const code = Number(error?.statusCode ?? error?.status ?? 0);
  if (code > 0) {
    return code;
  }

  const msg = String(error?.message ?? "");
  if (msg.includes("EntityAlreadyExists")) {
    return 409;
  }
  if (msg.includes("already exists")) {
    return 409;
  }
  if (msg.includes("Missing STORAGE_CONNECTION_STRING")) {
    return 500;
  }

  return fallbackStatus;
}

export function getFormationEventsTableClient(): TableClient {
  const conn = getConnString();
  if (!conn) {
    throw new Error("Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage).");
  }
  return TableClient.fromConnectionString(conn, FORMATION_EVENTS_TABLE);
}

export function getFormationProfilesTableClient(): TableClient {
  const conn = getConnString();
  if (!conn) {
    throw new Error("Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage).");
  }
  return TableClient.fromConnectionString(conn, FORMATION_PROFILES_TABLE);
}

export async function ensureTable(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (err: any) {
    const code = Number(err?.statusCode ?? err?.status ?? 0);
    if (code === 409) {
      return;
    }
    throw err;
  }
}

export async function ensureFormationTables(): Promise<void> {
  const eventsTable = getFormationEventsTableClient();
  const profilesTable = getFormationProfilesTableClient();
  await ensureTable(eventsTable);
  await ensureTable(profilesTable);
}

export async function getFormationProfileByVisitorId(
  table: TableClient,
  visitorId: string
): Promise<FunctionFormationProfileEntity | null> {
  try {
    const entity = await table.getEntity<FunctionFormationProfileEntity>("VISITOR", visitorId);
    return deserializeGroups({
      ...entity,
      partitionKey: "VISITOR",
      rowKey: visitorId,
      visitorId
    });
  } catch (err: any) {
    const code = Number(err?.statusCode ?? err?.status ?? 0);
    if (code === 404) {
      return null;
    }
    throw err;
  }
}

export async function listFormationEventsByVisitorId(
  table: TableClient,
  visitorIdOrInput: string | {
    visitorId: string;
    limit?: number;
    beforeRowKey?: string;
    sinceOccurredAt?: string;
    untilOccurredAt?: string;
  },
  input?: {
    limit?: number;
    beforeRowKey?: string;
    sinceOccurredAt?: string;
    untilOccurredAt?: string;
  }
): Promise<FunctionFormationEventEntity[]> {
  const visitorId =
    typeof visitorIdOrInput === "string"
      ? visitorIdOrInput
      : String(visitorIdOrInput.visitorId ?? "").trim();
  const resolvedInput =
    typeof visitorIdOrInput === "string"
      ? input
      : {
          limit: visitorIdOrInput.limit,
          beforeRowKey: visitorIdOrInput.beforeRowKey,
          sinceOccurredAt: visitorIdOrInput.sinceOccurredAt,
          untilOccurredAt: visitorIdOrInput.untilOccurredAt
        };
  const limit = resolvedInput?.limit ?? 50;

  const filter = resolvedInput?.beforeRowKey
    ? `PartitionKey eq '${escapeOData(visitorId)}' and RowKey lt '${escapeOData(resolvedInput!.beforeRowKey)}'`
    : `PartitionKey eq '${escapeOData(visitorId)}'`;

  const select = [
    "PartitionKey",
    "RowKey",
    "visitorId",
    "type",
    "occurredAt",
    "recordedAt",
    "channel",
    "visibility",
    "sensitivity",
    "summary",
    "metadata",
    "idempotencyKey"
  ];

  const results: FunctionFormationEventEntity[] = [];

  for await (const entity of table.listEntities<any>({
    queryOptions: { filter, select }
  })) {
    results.push({
      partitionKey: entity.partitionKey ?? entity.PartitionKey,
      rowKey: entity.rowKey ?? entity.RowKey,
      visitorId: entity.visitorId,
      type: entity.type,
      occurredAt: entity.occurredAt,
      recordedAt: entity.recordedAt,
      channel: entity.channel,
      visibility: entity.visibility,
      sensitivity: entity.sensitivity,
      summary: entity.summary,
      metadata: entity.metadata,
      idempotencyKey: entity.idempotencyKey
    });
  }

  results.sort(compareTimelineNewestFirst);

  const filtered = results.filter((item) => {
    const occurredAt = String(item.occurredAt ?? "");
    if (resolvedInput?.sinceOccurredAt && occurredAt < resolvedInput.sinceOccurredAt) {
      return false;
    }
    if (resolvedInput?.untilOccurredAt && occurredAt > resolvedInput.untilOccurredAt) {
      return false;
    }
    return true;
  });

  return filtered.slice(0, limit);
}

async function applyFormationEventToProfile(params: {
  profile: FunctionFormationProfileEntity;
  visitorId: string;
  type: string;
  occurredAt: string;
  eventId: string;
  data: any;
  source: Record<string, any>;
  shouldAdvance: boolean;
}): Promise<void> {
  const { profile, visitorId, type, occurredAt, eventId, data, source, shouldAdvance } = params;

  if (shouldAdvance) {
    profile.lastEventType = type;
    profile.lastEventAt = occurredAt;
    (profile as any).lastEventId = eventId;
    (profile as any).lastSourceSystem =
      typeof source?.system === "string" ? source.system : null;
    (profile as any).lastSourceCategory =
      typeof source?.category === "string" ? source.category : null;
    (profile as any).lastActorId =
      typeof source?.actorId === "string" ? source.actorId : null;
  }

  if (type === "GROUP_JOINED") {
    const groupId = String(data.groupId ?? "").trim();
    const displayName = String(data.displayName ?? "").trim();

    if (displayName) {
      profile.displayName = displayName;
    }

    const currentGroups = Array.isArray((profile as any).groups)
      ? [...(profile as any).groups]
      : [];

    const existingIndex = currentGroups.findIndex(
      (g: any) => String(g?.groupId ?? "").trim() === groupId
    );

    const nextGroup =
      existingIndex >= 0
        ? {
            ...currentGroups[existingIndex],
            groupId,
            ...(displayName ? { displayName } : {})
          }
        : {
            groupId,
            ...(displayName ? { displayName } : {})
          };

    (profile as any).groups =
      existingIndex >= 0
        ? currentGroups.map((g: any, i: number) => (i === existingIndex ? nextGroup : g))
        : [...currentGroups, nextGroup];
  }

  if (type === "GROUP_LEFT") {
    const groupId = String(data.groupId ?? "").trim();
    const currentGroups = Array.isArray((profile as any).groups)
      ? [...(profile as any).groups]
      : [];

    (profile as any).groups = currentGroups.filter(
      (g: any) => String(g?.groupId ?? "").trim() !== groupId
    );
  }

  if (type === "FOLLOWUP_ASSIGNED") {
    const assigneeId = normalizeAssignedTo(data.assigneeId);
    if (!assigneeId) {
      throw new Error("FOLLOWUP_ASSIGNED requires data.assigneeId (string)");
    }

    const displayName = String(data.displayName ?? "").trim();
    if (displayName) {
      profile.displayName = displayName;
    } else if (!String(profile.displayName ?? "").trim()) {
      const visitor = await getVisitorById(visitorId);
      const visitorName = String(visitor?.name ?? "").trim();
      if (visitorName) {
        profile.displayName = visitorName;
      }
    }

    formationMutationDispatchers.FOLLOWUP_ASSIGNED({
      type,
      profile,
      data,
      occurredAtIso: occurredAt,
      eventId
    });
  }

  if (type === "FOLLOWUP_UNASSIGNED") {
    if (shouldAdvance) {
      profile.assignedTo = null;
    }
  }

  if (type === "FOLLOWUP_CONTACTED") {
    if (
      !profile.lastFollowupContactedAt ||
      occurredAt > profile.lastFollowupContactedAt
    ) {
      profile.lastFollowupContactedAt = occurredAt;
    }
  }

  if (type === "FOLLOWUP_OUTCOME_RECORDED") {
    const outcome = String(data.outcome ?? "").trim();
    if (!outcome) {
      throw new Error("FOLLOWUP_OUTCOME_RECORDED requires data.outcome (string)");
    }

    formationMutationDispatchers.FOLLOWUP_OUTCOME_RECORDED({
      type,
      profile,
      data,
      occurredAtIso: occurredAt,
      eventId
    });
  }

  if (type === "NEXT_STEP_SELECTED" || type === "NEXT_STEP_COMPLETED") {
    const nextStep = String(data.nextStep ?? "").trim();
    if (!nextStep) {
      throw new Error("NEXT_STEP event requires data.nextStep (string)");
    }

    formationMutationDispatchers[type]({
      type,
      profile,
      data,
      occurredAtIso: occurredAt,
      eventId
    });
  }

  if (type === "PRAYER_REQUESTED") {
    applyTouchpointTimestamp({
      profile: profile as any,
      field: "lastPrayerRequestedAt",
      occurredAtIso: occurredAt
    });
  }
}
export async function recordFormationEventV1(body: unknown): Promise<{
  accepted: boolean;
  id: string;
  visitorId: string;
  type: string;
  occurredAt: string;
  rowKey: string;
  profile: FunctionFormationProfileEntity;
}> {
  const envelope = validateFormationEventEnvelopeV1Strict(body);
  const visitorId = String(envelope.visitorId).trim();
  const eventId = String(envelope.eventId).trim();
  const type = String(envelope.type).trim();
  const occurredAt = normalizeIso(envelope.occurredAt, "occurredAt");
  const source = asObject(envelope.source);
  const data = asObject(envelope.data);

  if (OPERATOR_MUTATION_EVENT_TYPES.has(type)) {
    const actorId = normalizeOptionalActorId(source.actorId);
    const staffIdentity = actorId
      ? await readMutationActorStaffIdentity(actorId)
      : null;

    if (!staffIdentity || staffIdentity.status !== "active") {
      throw new Error(
        "source.actorId must reference an active staff identity for followup mutations"
      );
    }
  }

  const eventsTable = getFormationEventsTableClient();
  const profilesTable = getFormationProfilesTableClient();

  const rowKey = buildEventRowKey(occurredAt, eventId);

  let existingEvent: any = null;
  try {
    existingEvent = await eventsTable.getEntity<any>(visitorId, rowKey);
  } catch (err: any) {
    const code = Number(err?.statusCode ?? err?.status ?? 0);
    if (code !== 404) {
      throw err;
    }
  }

  if (!existingEvent) {
    const duplicateFilter =
      "PartitionKey eq '" + escapeOData(visitorId) + "' and idempotencyKey eq '" + escapeOData(eventId) + "'";

    for await (const entity of eventsTable.listEntities<any>({
      queryOptions: {
        filter: duplicateFilter,
        select: [
          "PartitionKey",
          "RowKey",
          "visitorId",
          "type",
          "occurredAt",
          "recordedAt",
          "channel",
          "visibility",
          "sensitivity",
          "summary",
          "metadata",
          "idempotencyKey"
        ]
      }
    })) {
      existingEvent = {
        partitionKey: entity.partitionKey ?? entity.PartitionKey,
        rowKey: entity.rowKey ?? entity.RowKey,
        visitorId: entity.visitorId,
        type: entity.type,
        occurredAt: entity.occurredAt,
        recordedAt: entity.recordedAt,
        channel: entity.channel,
        visibility: entity.visibility,
        sensitivity: entity.sensitivity,
        summary: entity.summary,
        metadata: entity.metadata,
        idempotencyKey: entity.idempotencyKey
      };
      break;
    }
  }

  if (!existingEvent) {
    const eventEntity: { partitionKey: string; rowKey: string } & Record<string, any> = {
      partitionKey: visitorId,
      rowKey,
      visitorId,
      type,
      occurredAt,
      recordedAt: new Date().toISOString(),
      idempotencyKey: eventId,
      metadata: JSON.stringify({
        source,
        data
      }),
      channel: "api",
      summary: type
    };

    try {
      await eventsTable.createEntity(eventEntity);

// --- Global Timeline Write (formation v1 path) ---
try {
  const repo = new GlobalTimelineRepository();

  await repo.append({
    eventId: eventEntity.idempotencyKey ?? eventEntity.id,
    visitorId: eventEntity.visitorId,
    stream: "formation",
    type: eventEntity.type,
    occurredAt: eventEntity.occurredAt,
    summary: eventEntity.summary ?? null,
    source: resolveMutationSource({ system: eventEntity.channel }).system,
    raw: eventEntity
  });
} catch (err: any) {
  logFunctionError(null, "recordFormationEventV1.globalTimelineAppend", err, {
    visitorId: eventEntity.visitorId,
    eventId: eventEntity.id,
    type: eventEntity.type,
    occurredAt: eventEntity.occurredAt
  });

  throw new Error(`globalTimeline append failed (v1 path): ${String(err?.message ?? err)}`);
}
// --- End Global Timeline Write ---
    } catch (err: any) {
      const code = Number(err?.statusCode ?? err?.status ?? 0);

      if (code === 409) {
        existingEvent = eventEntity;
      } else {
        throw err;
      }
    }
  }

  const existingProfile = await getFormationProfileByVisitorId(profilesTable, visitorId);
  if (existingEvent) {
    const profile: FunctionFormationProfileEntity = {
      ...(existingProfile ?? {}),
      partitionKey: "VISITOR",
      rowKey: visitorId,
      visitorId
    };

    logFormationEventDecision({
      eventId,
      visitorId,
      type,
      occurredAt,
      rowKey,
      accepted: false,
      projectionChanged: false,
      reason: "duplicate"
    });

    return {
      accepted: false,
      id: eventId,
      visitorId,
      type,
      occurredAt,
      rowKey,
      profile
    };
  }

  const profile: FunctionFormationProfileEntity = {
    ...(existingProfile ?? {}),
    partitionKey: "VISITOR",
    rowKey: visitorId,
    visitorId
  };

  const shouldAdvance = shouldAdvanceEventState(
    occurredAt,
    eventId,
    existingProfile?.lastEventAt,
    (existingProfile as any)?.lastEventId
  );

  await applyFormationEventToProfile({
    profile,
    visitorId,
    type,
    occurredAt,
    eventId,
    data,
    source,
    shouldAdvance
  });

  const beforeState = toComparableProfileState(existingProfile);
  const afterState = toComparableProfileState(profile);

  const projectionChanged = beforeState !== afterState;

  if (projectionChanged) {
    profile.updatedAt = new Date().toISOString();

    const updateMode =
      type === "FOLLOWUP_UNASSIGNED"
        ? "Replace"
        : "Merge";

    await profilesTable.upsertEntity(
      serializeGroups(profile) as any,
      updateMode
    );
  }

  logFormationEventDecision({
    eventId,
    visitorId,
    type,
    occurredAt,
    rowKey,
    accepted: true,
    projectionChanged
  });

  return {
    accepted: true,
    id: eventId,
    visitorId,
    type,
    occurredAt,
    rowKey,
    profile
  };
}

export async function deriveFormationProfileForVisitor(visitorIdInput: string): Promise<{
  visitorId: string;
  eventCount: number;
  profile: FunctionFormationProfileEntity;
}> {
  const visitorId = String(visitorIdInput ?? "").trim();
  if (!visitorId) {
    throw new Error("visitorId is required");
  }

  const eventsTable = getFormationEventsTableClient();
  await ensureTable(eventsTable);

  const events = await listFormationEventsByVisitorId(eventsTable, {
    visitorId,
    limit: 10000
  });

  events.sort((a, b) => compareEventOrder(a.occurredAt, a.rowKey, b.occurredAt, b.rowKey));

  const profile: FunctionFormationProfileEntity = {
    partitionKey: "VISITOR",
    rowKey: visitorId,
    visitorId
  };

  for (const event of events) {
    const eventId = String((event as any).id ?? event.rowKey ?? "").split("__").pop() ?? "";
    const occurredAt = String(event.occurredAt ?? "").trim();
    const type = String(event.type ?? "").trim();
    const metadata = parseMetadataJson(event.metadata) ?? {};
    const data = metadata.data ?? metadata;
    const source =
      metadata.source && typeof metadata.source === "object"
        ? metadata.source
        : {};

    const shouldAdvance = shouldAdvanceEventState(
      occurredAt,
      eventId,
      profile.lastEventAt,
      (profile as any).lastEventId
    );

    await applyFormationEventToProfile({
      profile,
      visitorId,
      type,
      occurredAt,
      eventId,
      data,
      source,
      shouldAdvance
    });
  }

  return {
    visitorId,
    eventCount: events.length,
    profile
  };
}

export async function auditFormationProfileForVisitor(
  visitorIdInput: string,
  options?: { repair?: boolean }
): Promise<{
  visitorId: string;
  eventCount: number;
  drifted: boolean;
  repaired: boolean;
  currentProfile: FunctionFormationProfileEntity | null;
  expectedProfile: FunctionFormationProfileEntity;
  profileBehind: boolean;
  lagMs: number | null;
  latestEventAt: string | null;
  profileLastEventAt: string | null;
  driftFields: string[];
}> {
  const visitorId = String(visitorIdInput ?? "").trim();
  if (!visitorId) {
    throw new Error("visitorId is required");
  }

  const profilesTable = getFormationProfilesTableClient();
  await ensureTable(profilesTable);

  const currentProfile = await getFormationProfileByVisitorId(profilesTable, visitorId);
  const derived = await deriveFormationProfileForVisitor(visitorId);

  const currentState = toComparableProfileState(currentProfile);
  const expectedState = toComparableProfileState(derived.profile);
  const drifted = currentState !== expectedState;

  const latestEventAt = derived.profile.lastEventAt ?? null;
  const profileLastEventAt = currentProfile?.lastEventAt ?? null;

  const latestEventTime = latestEventAt ? Date.parse(latestEventAt) : NaN;
  const profileLastEventTime = profileLastEventAt ? Date.parse(profileLastEventAt) : NaN;

  const profileBehind = Number.isFinite(latestEventTime) && (
    !Number.isFinite(profileLastEventTime) ||
    profileLastEventTime < latestEventTime
  );

  const lagMs = profileBehind && Number.isFinite(latestEventTime)
    ? latestEventTime - (Number.isFinite(profileLastEventTime) ? profileLastEventTime : 0)
    : null;

  const currentComparable = currentProfile ? JSON.parse(currentState) : {};
  const expectedComparable = JSON.parse(expectedState);

  const driftFields = Array.from(
    new Set([
      ...Object.keys(currentComparable),
      ...Object.keys(expectedComparable)
    ])
  ).filter(key => JSON.stringify(currentComparable[key] ?? null) !== JSON.stringify(expectedComparable[key] ?? null));

  let repaired = false;

  if (options?.repair === true && drifted) {
    derived.profile.updatedAt = new Date().toISOString();

    await profilesTable.upsertEntity(
      serializeGroups(derived.profile) as any,
      "Replace"
    );

    repaired = true;

    return await auditFormationProfileForVisitor(visitorId, {
      repair: false
    }).then(result => ({
      ...result,
      repaired: true
    }));
  }

  return {
    visitorId,
    eventCount: derived.eventCount,
    drifted,
    repaired,
    currentProfile,
    expectedProfile: derived.profile,
    profileBehind,
    lagMs,
    latestEventAt,
    profileLastEventAt,
    driftFields
  };
}

export async function rebuildFormationProfileForVisitor(visitorIdInput: string): Promise<{
  visitorId: string;
  eventCount: number;
  profile: FunctionFormationProfileEntity;
}> {
  const audit = await auditFormationProfileForVisitor(visitorIdInput, { repair: true });

  return {
    visitorId: audit.visitorId,
    eventCount: audit.eventCount,
    profile: audit.expectedProfile
  };
}
function parseMetadataJson(value: unknown): any {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function matchesProfileFilters(
  profile: FunctionFormationProfileEntity,
  filters?: {
    stage?: string;
    assignedTo?: string;
    q?: string;
    segment?: string;
  }
): boolean {
  const stage = String(filters?.stage ?? "").trim();
  const assignedTo = String(filters?.assignedTo ?? "").trim();
  const q = String(filters?.q ?? "").trim().toLowerCase();

  if (stage && String(profile.stage ?? "").trim() !== stage) {
    return false;
  }

  if (assignedTo && String(profile.assignedTo ?? "").trim() !== assignedTo) {
    return false;
  }

  if (q) {
    const haystack = [
      profile.visitorId,
      profile.stage,
      profile.assignedTo,
      profile.lastEventType,
      profile.stageReason
    ]
      .map(v => String(v ?? ""))
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(q)) {
      return false;
    }
  }

  return true;
}

export async function listFormationProfiles(
  table: TableClient,
  input?: {
    limit?: number;
    cursor?: string;
    stage?: string;
    assignedTo?: string;
    q?: string;
    segment?: string;
  }
): Promise<{
  items: FunctionFormationProfileEntity[];
  cursor: string | null;
}> {
  const limit = Math.max(1, Math.min(Number(input?.limit ?? 50), 200));
  const cursor = input?.cursor ? String(input.cursor) : undefined;

  const filter = cursor
    ? `PartitionKey eq 'VISITOR' and RowKey gt '${escapeOData(cursor)}'`
    : `PartitionKey eq 'VISITOR'`;

  const select = [
    "PartitionKey",
    "RowKey",
    "visitorId",
    "stage",
    "stageUpdatedAt",
    "stageUpdatedBy",
    "stageReason",
    "stageEventId",
    "assignedTo",
    "lastEventType",
    "lastEventAt",
    "updatedAt",
    "lastServiceAttendedAt",
    "lastFollowupAssignedAt",
    "lastFollowupContactedAt",
    "lastFollowupOutcomeAt",
    "lastFollowupOutcome",
    "lastFollowupOutcomeNotes",
    "lastNextStepAt",
    "lastNextStepCompletedAt",
    "lastPrayerRequestedAt",
    "displayName",
    "groupsJson"
  ];

  const matched: FunctionFormationProfileEntity[] = [];
  let hasMore = false

  for await (const entity of table.listEntities<any>({
    queryOptions: { filter, select }
  })) {
    const profile = deserializeGroups({
      partitionKey: "VISITOR",
      rowKey: entity.rowKey ?? entity.RowKey,
      visitorId: entity.visitorId ?? entity.rowKey ?? entity.RowKey,
      stage: entity.stage,
      stageUpdatedAt: entity.stageUpdatedAt,
      stageUpdatedBy: entity.stageUpdatedBy,
      stageReason: entity.stageReason,
      stageEventId: entity.stageEventId,
      assignedTo: entity.assignedTo,
      lastEventType: entity.lastEventType,
      lastEventAt: entity.lastEventAt,
      updatedAt: entity.updatedAt,
      lastServiceAttendedAt: entity.lastServiceAttendedAt,
      lastFollowupAssignedAt: entity.lastFollowupAssignedAt,
      lastFollowupContactedAt: entity.lastFollowupContactedAt,
      lastFollowupOutcomeAt: entity.lastFollowupOutcomeAt,
      lastFollowupOutcome: entity.lastFollowupOutcome,
      lastFollowupOutcomeNotes: entity.lastFollowupOutcomeNotes,
      lastNextStepAt: entity.lastNextStepAt,
      lastNextStepCompletedAt: entity.lastNextStepCompletedAt,
      lastPrayerRequestedAt: entity.lastPrayerRequestedAt,
      displayName: entity.displayName,
      groupsJson: entity.groupsJson
    }) as FunctionFormationProfileEntity;

    if (!matchesProfileFilters(profile, input)) {
      continue;
    }

    const segment = String(input?.segment ?? "").trim();

    if (
      segment === "connected-without-next-step" &&
      (String(profile.stage ?? "").trim() !== "Connected" ||
        String(profile.lastNextStepAt ?? "").trim().length > 0)
    ) {
      continue;
    }

    if (
      segment === "next-step-selected-not-completed" &&
      (String(profile.lastNextStepAt ?? "").trim().length === 0 ||
        String(profile.lastNextStepCompletedAt ?? "").trim().length > 0)
    ) {
      continue;
    }

    if (
      segment === "active-care-without-outcome" &&
      (String(profile.assignedTo ?? "").trim().length === 0 ||
        String(profile.lastFollowupOutcomeAt ?? "").trim().length > 0)
    ) {
      continue;
    }

    if (
      segment === "connected-without-care-owner" &&
      (String(profile.stage ?? "").trim() !== "Connected" ||
        String(profile.assignedTo ?? "").trim().length > 0)
    ) {
      continue;
    }

    matched.push(profile);

    if (matched.length > limit) {
      hasMore = true
      break;
    }
  }

  const items = hasMore ? matched.slice(0, limit) : matched;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].rowKey : null;

  return {
    items,
    cursor: nextCursor
  };
}

