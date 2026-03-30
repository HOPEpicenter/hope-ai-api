
function normalizeAssignedTo(input: any): string | null {
  if (input === null || input === undefined) return null;

  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}
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
  updatedAt?: string;
  lastServiceAttendedAt?: string;
  lastFollowupAssignedAt?: string;
  lastFollowupContactedAt?: string;
  lastFollowupOutcomeAt?: string;
  lastFollowupOutcome?: string;
  lastFollowupOutcomeNotes?: string;
  lastNextStepAt?: string;
  lastPrayerRequestedAt?: string;
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

const SUPPORTED_FORMATION_EVENT_TYPES = new Set([
  "FOLLOWUP_ASSIGNED",
  "FOLLOWUP_UNASSIGNED",
  "FOLLOWUP_CONTACTED",
  "FOLLOWUP_OUTCOME_RECORDED",
  "NEXT_STEP_SELECTED"
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

  const data = asObject(obj.data);

  if (type === "FOLLOWUP_ASSIGNED") {
    requireNonEmptyString(data.assigneeId, "data.assigneeId");
  }

  if (type === "NEXT_STEP_SELECTED") {
    requireNonEmptyString(data.nextStep, "data.nextStep");
  }

  return {
    v,
    eventId,
    visitorId,
    type,
    occurredAt,
    source: {
      ...source,
      system: sourceSystem
    },
    data
  };
}

function buildEventRowKey(occurredAtIso: string, eventId: string): string {
  return occurredAtIso + "__" + String(eventId).trim();
}

function eventAtOrMin(value: unknown): number {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return Number.NEGATIVE_INFINITY;
  }

  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function compareEventOrder(
  leftOccurredAtIso: unknown,
  leftEventId: unknown,
  rightOccurredAtIso: unknown,
  rightEventId: unknown
): number {
  const leftMs = eventAtOrMin(leftOccurredAtIso);
  const rightMs = eventAtOrMin(rightOccurredAtIso);

  if (leftMs !== rightMs) {
    return leftMs - rightMs;
  }

  const leftId = String(leftEventId ?? "").trim();
  const rightId = String(rightEventId ?? "").trim();
  return leftId.localeCompare(rightId);
}

function shouldAdvanceEventState(
  profile: FunctionFormationProfileEntity | null,
  occurredAtIso: string,
  eventId: string
): boolean {
  return compareEventOrder(
    occurredAtIso,
    eventId,
    profile?.lastEventAt,
    (profile as any)?.lastEventId
  ) >= 0;
}

function maybeSetStage(
  profile: FunctionFormationProfileEntity,
  stage: string,
  occurredAtIso: string,
  eventType: string
): void {
  if (profile.stage !== stage) {
    profile.stage = stage;
    profile.stageUpdatedAt = occurredAtIso;
    profile.stageUpdatedBy = "system";
    profile.stageReason = "event:" + eventType;
  }
}

function shouldAdvanceTouchpointAt(currentAt: unknown, occurredAtIso: string): boolean {
  return !currentAt || occurredAtIso > String(currentAt);
}

function toComparableProfileState(profile: FunctionFormationProfileEntity | null): string {
  if (!profile) {
    return "";
  }

  const comparable = {
    stage: profile.stage ?? null,
    stageUpdatedAt: profile.stageUpdatedAt ?? null,
    stageUpdatedBy: profile.stageUpdatedBy ?? null,
    stageReason: profile.stageReason ?? null,
    assignedTo: profile.assignedTo ?? null,
    lastEventType: profile.lastEventType ?? null,
    lastEventAt: profile.lastEventAt ?? null,
    lastEventId: (profile as any).lastEventId ?? null,
    lastServiceAttendedAt: profile.lastServiceAttendedAt ?? null,
    lastFollowupAssignedAt: profile.lastFollowupAssignedAt ?? null,
    lastFollowupContactedAt: profile.lastFollowupContactedAt ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeNotes: profile.lastFollowupOutcomeNotes ?? null,
    lastNextStepAt: profile.lastNextStepAt ?? null,
    lastPrayerRequestedAt: profile.lastPrayerRequestedAt ?? null
  };

  return JSON.stringify(comparable);
}

function logFormationEventDecision(payload: Record<string, unknown>): void {
  console.log("[formation-event]", JSON.stringify(payload));
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

export async function listFormationEventsByVisitorId(
  table: TableClient,
  visitorIdOrInput: string | { visitorId: string; limit?: number; beforeRowKey?: string },
  input?: {
    limit?: number;
    beforeRowKey?: string;
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
          beforeRowKey: visitorIdOrInput.beforeRowKey
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

    if (results.length >= limit) {
      break;
    }
  }

  return results;
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
    } catch (err: any) {
      const code = Number(err?.statusCode ?? err?.status ?? 0);

      // 409 = already exists; treat as idempotent success
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

  const shouldAdvance = shouldAdvanceEventState(existingProfile, occurredAt, eventId);

  if (shouldAdvance) {
    profile.lastEventType = type;
    profile.lastEventAt = occurredAt;
    (profile as any).lastEventId = eventId;
  }

  if (type === "FOLLOWUP_ASSIGNED") {
    const assigneeId = normalizeAssignedTo(data.assigneeId);
    if (!assigneeId) {
      throw new Error("FOLLOWUP_ASSIGNED requires data.assigneeId (string)");
    }

    if (shouldAdvanceTouchpointAt(profile.lastFollowupAssignedAt, occurredAt)) {
      profile.assignedTo = assigneeId;
      profile.lastFollowupAssignedAt = occurredAt;
      maybeSetStage(profile, "Connected", occurredAt, type);
    }
  }

  if (type === "FOLLOWUP_UNASSIGNED") {
    if (shouldAdvance) {
      profile.assignedTo = null;
      maybeSetStage(profile, "Connected", occurredAt, type);
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

    if (shouldAdvanceTouchpointAt(profile.lastFollowupOutcomeAt, occurredAt)) {
      profile.lastFollowupOutcomeAt = occurredAt;
      profile.lastFollowupOutcome = outcome;
      profile.lastFollowupOutcomeNotes =
        typeof data.notes === "string" ? data.notes.trim() || undefined : undefined;
      maybeSetStage(profile, "Connected", occurredAt, type);
    }
  }

  if (type === "NEXT_STEP_SELECTED") {
    const nextStep = String(data.nextStep ?? "").trim();
    if (!nextStep) {
      throw new Error("NEXT_STEP_SELECTED requires data.nextStep (string)");
    }

    if (shouldAdvanceTouchpointAt(profile.lastNextStepAt, occurredAt)) {
      profile.lastNextStepAt = occurredAt;
      maybeSetStage(profile, "Connected", occurredAt, type);
    }
  }

  const beforeState = toComparableProfileState(existingProfile);
  const afterState = toComparableProfileState(profile);

  const projectionChanged = beforeState !== afterState;

  if (projectionChanged) {
    profile.updatedAt = new Date().toISOString();
    await profilesTable.upsertEntity(profile as any, "Merge");
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
    "lastPrayerRequestedAt"
  ];

  const matched: FunctionFormationProfileEntity[] = [];

  for await (const entity of table.listEntities<any>({
    queryOptions: { filter, select }
  })) {
    const profile: FunctionFormationProfileEntity = {
      partitionKey: "VISITOR",
      rowKey: entity.rowKey ?? entity.RowKey,
      visitorId: entity.visitorId ?? entity.rowKey ?? entity.RowKey,
      stage: entity.stage,
      stageUpdatedAt: entity.stageUpdatedAt,
      stageUpdatedBy: entity.stageUpdatedBy,
      stageReason: entity.stageReason,
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
      lastPrayerRequestedAt: entity.lastPrayerRequestedAt
    };

    if (!matchesProfileFilters(profile, input)) {
      continue;
    }

    matched.push(profile);

    if (matched.length >= limit) {
      break;
    }
  }

  const nextCursor = matched.length > 0 ? matched[matched.length - 1].rowKey : null;

  return {
    items: matched,
    cursor: nextCursor
  };
}



