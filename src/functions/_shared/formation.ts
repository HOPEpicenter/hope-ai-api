import crypto from "crypto";
import { TableClient } from "@azure/data-tables";
import { getConnString } from "./tableClient";

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
  id?: string;
};

export type FunctionFormationProfileEntity = {
  partitionKey: "VISITOR";
  rowKey: string;
  visitorId: string;
  stage?: string;
  stageUpdatedAt?: string;
  stageUpdatedBy?: string;
  stageReason?: string;
  assignedTo?: string | null;
  lastEventType?: string;
  lastEventAt?: string;
  lastEventId?: string;
  updatedAt?: string;
  lastServiceAttendedAt?: string;
  lastFollowupAssignedAt?: string;
  lastFollowupContactedAt?: string;
  lastFollowupOutcomeAt?: string;
  lastNextStepAt?: string;
  lastPrayerRequestedAt?: string;
  [k: string]: any;
};

export type NormalizedFormationEventInput = {
  visitorId: string;
  type: string;
  occurredAt: string;
  id: string;
  metadata: Record<string, any>;
  channel: string;
  visibility: string;
  sensitivity: string;
  summary?: string;
};

const FORMATION_EVENTS_TABLE = process.env.FORMATION_EVENTS_TABLE || "devFormationEvents";
const FORMATION_PROFILES_TABLE = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";

function nowIso(): string {
  return new Date().toISOString();
}

function escapeOData(value: string): string {
  return String(value ?? "").replace(/'/g, "''");
}

function makeRowKey(occurredAtIso: string, eventId: string): string {
  return `${occurredAtIso}__${eventId}`;
}

function stringifyMetadata(metadata: unknown): string | undefined {
  if (metadata == null) return undefined;
  return JSON.stringify(metadata);
}

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function asObject(v: any): Record<string, any> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as any) : null;
}

function createDefaultFormationProfile(visitorId: string): FunctionFormationProfileEntity {
  const now = nowIso();
  return {
    partitionKey: "VISITOR",
    rowKey: visitorId,
    visitorId,
    stage: "Visitor",
    stageUpdatedAt: now
  };
}

function normalizeStage(value: unknown): "Visitor" | "Guest" | "Connected" {
  const s = String(value ?? "").trim();
  return s === "Guest" || s === "Connected" ? s : "Visitor";
}

function maxStage(a: "Visitor" | "Guest" | "Connected", b: "Visitor" | "Guest" | "Connected") {
  const rank: Record<string, number> = { Visitor: 0, Guest: 1, Connected: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function computeNextStage(currentStage: unknown, eventType: string, metadata: any): "Visitor" | "Guest" | "Connected" {
  const current = normalizeStage(currentStage);

  switch (String(eventType ?? "").trim()) {
    case "FOLLOWUP_ASSIGNED":
      return maxStage(current, "Guest");

    case "NEXT_STEP_SELECTED":
      return maxStage(current, "Connected");

    case "FOLLOWUP_OUTCOME_RECORDED": {
      const outcome = String(metadata?.outcome ?? "").toUpperCase().trim();
      const connectedOutcomes = new Set([
        "CONNECTED",
        "WILL_VISIT",
        "VISITING",
        "ATTENDING",
        "NEXT_STEP_TAKEN",
        "JOINED_GROUP",
        "MEMBER_CLASS",
        "BAPTISM_CLASS"
      ]);
      return connectedOutcomes.has(outcome) ? maxStage(current, "Connected") : current;
    }

    default:
      return current;
  }
}

function applyProfileTouchpoint(
  profile: FunctionFormationProfileEntity,
  type: string,
  occurredAt: string,
  metadata: any
): void {
  switch (type) {
    case "SERVICE_ATTENDED":
      profile.lastServiceAttendedAt = occurredAt;
      break;

    case "FOLLOWUP_ASSIGNED":
      profile.lastFollowupAssignedAt = occurredAt;
      {
        const rawAssignee =
          metadata?.assigneeId ??
          metadata?.assignedTo ??
          metadata?.assignee;

        const assigneeId = String(rawAssignee ?? "").trim();
        if (assigneeId) {
          profile.assignedTo = assigneeId;
        }
      }
      break;

    case "FOLLOWUP_CONTACTED":
      profile.lastFollowupContactedAt = occurredAt;
      break;

    case "FOLLOWUP_OUTCOME_RECORDED":
      profile.lastFollowupOutcomeAt = occurredAt;
      break;

    case "NEXT_STEP_SELECTED":
    case "INFO_REQUESTED":
      profile.lastNextStepAt = occurredAt;
      break;

    case "PRAYER_REQUESTED":
      profile.lastPrayerRequestedAt = occurredAt;
      break;
  }

  const nextStage = computeNextStage(profile.stage, type, metadata);
  if (nextStage !== profile.stage) {
    profile.stage = nextStage;
    profile.stageUpdatedAt = occurredAt;
    profile.stageUpdatedBy = "system";
    profile.stageReason = `event:${type}`;
  }
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

export async function getFormationProfileByVisitorId(
  table: TableClient,
  visitorId: string
): Promise<FunctionFormationProfileEntity | null> {
  try {
    const entity = await table.getEntity<FunctionFormationProfileEntity>("VISITOR", visitorId);
    return {
      ...entity,
      partitionKey: "VISITOR",
      rowKey: visitorId,
      visitorId
    };
  } catch (err: any) {
    const code = Number(err?.statusCode ?? err?.status ?? 0);
    if (code === 404) {
      return null;
    }
    throw err;
  }
}

export async function upsertFormationProfile(
  table: TableClient,
  entity: FunctionFormationProfileEntity
): Promise<void> {
  await table.upsertEntity(entity as any, "Merge");
}

export async function findExistingFormationEventById(
  table: TableClient,
  visitorId: string,
  eventId: string
): Promise<FunctionFormationEventEntity | null> {
  const filter = `PartitionKey eq '${escapeOData(visitorId)}' and id eq '${escapeOData(eventId)}'`;

  for await (const entity of table.listEntities<any>({ queryOptions: { filter } })) {
    return {
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
      idempotencyKey: entity.idempotencyKey,
      id: entity.id
    };
  }

  return null;
}

export async function insertFormationEvent(
  table: TableClient,
  entity: FunctionFormationEventEntity
): Promise<void> {
  await table.createEntity(entity as any);
}

export async function listFormationEventsByVisitorId(
  table: TableClient,
  visitorId: string,
  input?: {
    limit?: number;
    beforeRowKey?: string;
  }
): Promise<FunctionFormationEventEntity[]> {
  const limit = input?.limit ?? 50;

  const filter = input?.beforeRowKey
    ? `PartitionKey eq '${escapeOData(visitorId)}' and RowKey lt '${escapeOData(input.beforeRowKey)}'`
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
    "idempotencyKey",
    "id"
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
      idempotencyKey: entity.idempotencyKey,
      id: entity.id
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

export function normalizeFormationWriteBody(body: any): NormalizedFormationEventInput {
  const o = asObject(body);
  if (!o) {
    throw new Error("Body must be an object");
  }

  const isV1 = o.v === 1 || isNonEmptyString(o.eventId) || (o.source && isNonEmptyString(o.source.system));

  if (isV1) {
    if (o.v !== 1) throw new Error("v must be 1");
    if (!isNonEmptyString(o.eventId)) throw new Error("eventId is required");
    if (!isNonEmptyString(o.visitorId)) throw new Error("visitorId is required");
    if (!isNonEmptyString(o.type)) throw new Error("type is required");
    if (!isNonEmptyString(o.occurredAt)) throw new Error("occurredAt is required");

    const src = asObject(o.source);
    if (!src || !isNonEmptyString(src.system)) {
      throw new Error("source.system is required");
    }

    const data = o.data;
    if (data !== undefined && asObject(data) === null) {
      throw new Error("data must be an object if present");
    }

    const metadata = asObject(data) ?? {};
    const type = String(o.type).trim();

    if (type === "FOLLOWUP_ASSIGNED") {
      const raw = metadata.assigneeId ?? metadata.assignedTo ?? metadata.assignee;
      const assigneeId = typeof raw === "string" ? raw.trim() : "";
      if (!assigneeId) {
        throw new Error("FOLLOWUP_ASSIGNED requires data.assigneeId (string)");
      }
      metadata.assigneeId = assigneeId;
    }

    if (type === "NEXT_STEP_SELECTED") {
      if (!isNonEmptyString(metadata.nextStep)) {
        throw new Error("NEXT_STEP_SELECTED requires data.nextStep (string)");
      }
    }

    return {
      visitorId: String(o.visitorId).trim(),
      type,
      occurredAt: String(o.occurredAt).trim(),
      id: String(o.eventId).trim(),
      metadata,
      channel: "api",
      visibility: "ops",
      sensitivity: "normal",
      summary: undefined
    };
  }

  const visitorId = String(o.visitorId ?? "").trim();
  const type = String(o.type ?? "").trim();
  const occurredAt = String(o.occurredAt ?? "").trim();
  const id = String(o.id ?? o.idempotencyKey ?? crypto.randomUUID()).trim();
  const metadata = asObject(o.metadata) ?? {};
  const channel = String(o.channel ?? "api").trim() || "api";
  const visibility = String(o.visibility ?? "ops").trim() || "ops";
  const sensitivity = String(o.sensitivity ?? "normal").trim() || "normal";
  const summary = typeof o.summary === "string" ? o.summary : undefined;

  if (!visitorId) throw new Error("visitorId is required");
  if (!type) throw new Error("type is required");
  if (!occurredAt) throw new Error("occurredAt is required");

  return {
    visitorId,
    type,
    occurredAt,
    id,
    metadata,
    channel,
    visibility,
    sensitivity,
    summary
  };
}

export async function recordFormationEventForFunction(
  input: NormalizedFormationEventInput
): Promise<{ eventRowKey: string; profile: FunctionFormationProfileEntity }> {
  const eventsTable = getFormationEventsTableClient();
  const profilesTable = getFormationProfilesTableClient();

  await ensureTable(eventsTable);
  await ensureTable(profilesTable);

  let profile = await getFormationProfileByVisitorId(profilesTable, input.visitorId);
  if (!profile) {
    profile = createDefaultFormationProfile(input.visitorId);
  }

  profile.partitionKey = "VISITOR";
  profile.rowKey = input.visitorId;
  profile.visitorId = input.visitorId;

  const existing = await findExistingFormationEventById(eventsTable, input.visitorId, input.id);
  const rowKey = makeRowKey(input.occurredAt, input.id);

  if (existing) {
    return { eventRowKey: existing.rowKey || rowKey, profile };
  }

  const recordedAt = nowIso();

  const eventEntity: FunctionFormationEventEntity = {
    partitionKey: input.visitorId,
    rowKey,
    id: input.id,
    visitorId: input.visitorId,
    type: input.type,
    occurredAt: input.occurredAt,
    recordedAt,
    channel: input.channel,
    visibility: input.visibility,
    sensitivity: input.sensitivity,
    summary: input.summary,
    metadata: stringifyMetadata(input.metadata),
    idempotencyKey: input.id
  };

  await insertFormationEvent(eventsTable, eventEntity);

  applyProfileTouchpoint(profile, input.type, input.occurredAt, input.metadata);

  const existingRaw = profile.lastEventAt;
  const hasExisting = existingRaw !== undefined && existingRaw !== null && String(existingRaw).trim().length > 0;

  const incomingAtMs = Date.parse(String(input.occurredAt ?? ""));
  const existingAtMs = Date.parse(String(existingRaw ?? ""));
  const incomingEventId = String(input.id ?? "");
  const existingEventId = String(profile.lastEventId ?? "");

  let advanceLast = false;

  if (!hasExisting) {
    advanceLast = true;
  } else if (Number.isFinite(incomingAtMs) && Number.isFinite(existingAtMs)) {
    if (incomingAtMs > existingAtMs) advanceLast = true;
    else if (incomingAtMs === existingAtMs && incomingEventId && incomingEventId > existingEventId) {
      advanceLast = true;
    }
  }

  if (advanceLast) {
    profile.lastEventType = input.type;
    profile.lastEventAt = input.occurredAt;
    profile.lastEventId = incomingEventId || profile.lastEventId;
  }

  profile.updatedAt = recordedAt;

  await upsertFormationProfile(profilesTable, profile);

  return { eventRowKey: rowKey, profile };
}
