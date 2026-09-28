import { randomUUID } from "crypto";
import {
  ministryAreaNameKey,
  normalizeMinistryAreaName,
  projectMinistryAreas,
  type CanonicalMinistryArea,
  type MinistryAreaEvent,
  type MinistryAreaStatus
} from "../../domain/ministryAreas/projectMinistryAreas";
import {
  MinistryAreaEventsRepository,
  type MinistryAreaSnapshot
} from "../../repositories/ministryAreaEventsRepository";

type Repository = Pick<MinistryAreaEventsRepository, "readSnapshot" | "appendIfVersion">;
export type MinistryAreaCommandDependencies = {
  repository?: Repository;
  now?: () => string;
  newMinistryAreaId?: () => string;
};

export type MinistryAreaCommandInput = {
  commandId: string;
  actorId: string;
  ministryAreaId?: string;
  displayName?: string;
  status?: MinistryAreaStatus;
  reason?: string | null;
};

export type MinistryAreaCommandResult =
  | { accepted: true; eventId: string; ministryAreaId: string; type: MinistryAreaEvent["type"] }
  | { accepted: false; status: number; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RETRIES = 5;

function failure(status: number, error: string): MinistryAreaCommandResult {
  return { accepted: false, status, error };
}

function accepted(event: MinistryAreaEvent): MinistryAreaCommandResult {
  return { accepted: true, eventId: event.eventId,
    ministryAreaId: event.ministryAreaId, type: event.type };
}

function validateCommon(input: MinistryAreaCommandInput): MinistryAreaCommandResult | null {
  if (!UUID.test(String(input.commandId ?? ""))) {
    return failure(400, "commandId must be a UUID and reused for retries");
  }
  if (!String(input.actorId ?? "").trim()) return failure(400, "actorId is required");
  return null;
}

function nameConflict(items: CanonicalMinistryArea[], displayName: string, exceptId?: string): boolean {
  const key = ministryAreaNameKey(displayName);
  return items.some(item => item.ministryAreaId !== exceptId &&
    ministryAreaNameKey(item.displayName) === key);
}

function existingCommand(snapshot: MinistryAreaSnapshot, eventId: string,
  matches: (event: MinistryAreaEvent) => boolean): MinistryAreaCommandResult | null {
  const prior = snapshot.events.find(event => event.eventId === eventId);
  if (!prior) return null;
  return matches(prior) ? accepted(prior) : failure(409, "commandId was already used for a different command");
}

export async function createMinistryArea(
  input: MinistryAreaCommandInput,
  deps: MinistryAreaCommandDependencies = {}
): Promise<MinistryAreaCommandResult> {
  const invalid = validateCommon(input);
  if (invalid) return invalid;
  const displayName = normalizeMinistryAreaName(String(input.displayName ?? ""));
  if (!displayName || displayName.length > 120) return failure(400, "displayName must contain 1 to 120 characters");
  const actorId = input.actorId.trim();
  const eventId = `evt-${input.commandId.toLowerCase()}`;
  const repository = deps.repository ?? new MinistryAreaEventsRepository();
  const ministryAreaId = (deps.newMinistryAreaId ?? (() => `ministry-area-${randomUUID().replace(/-/g, "")}`))();
  const occurredAt = (deps.now ?? (() => new Date().toISOString()))();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const snapshot = await repository.readSnapshot();
    const prior = existingCommand(snapshot, eventId, event =>
      event.type === "ministryArea.created" && event.actorId === actorId &&
      event.data.displayName === displayName);
    if (prior) return prior;
    if (nameConflict(projectMinistryAreas(snapshot.events), displayName)) {
      return failure(409, "Ministry Area display name is already in use");
    }
    const event: MinistryAreaEvent = {
      eventId, ministryAreaId, type: "ministryArea.created", occurredAt, actorId,
      sequence: snapshot.revision + 1,
      data: { displayName, status: "active" }
    };
    if (await repository.appendIfVersion(event, snapshot.version)) return accepted(event);
  }
  return failure(409, "Ministry Area changed during the command; retry with the same commandId");
}

export async function updateMinistryArea(
  input: MinistryAreaCommandInput,
  deps: MinistryAreaCommandDependencies = {}
): Promise<MinistryAreaCommandResult> {
  const invalid = validateCommon(input);
  if (invalid) return invalid;
  const ministryAreaId = String(input.ministryAreaId ?? "").trim();
  if (!ministryAreaId) return failure(400, "ministryAreaId is required");
  if (input.status !== undefined && input.status !== "active" && input.status !== "inactive") {
    return failure(400, "status must be active or inactive");
  }
  const displayName = input.displayName === undefined
    ? undefined : normalizeMinistryAreaName(String(input.displayName));
  if (displayName !== undefined && (!displayName || displayName.length > 120)) {
    return failure(400, "displayName must contain 1 to 120 characters");
  }
  if (displayName === undefined && input.status === undefined) {
    return failure(400, "displayName or status is required");
  }
  const reason = input.reason === undefined ? undefined : String(input.reason ?? "").trim() || null;
  if (reason && reason.length > 500) return failure(400, "reason must contain at most 500 characters");
  const actorId = input.actorId.trim();
  const eventId = `evt-${input.commandId.toLowerCase()}`;
  const repository = deps.repository ?? new MinistryAreaEventsRepository();
  const occurredAt = (deps.now ?? (() => new Date().toISOString()))();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const snapshot = await repository.readSnapshot();
    const prior = existingCommand(snapshot, eventId, event =>
      event.type === "ministryArea.updated" && event.ministryAreaId === ministryAreaId &&
      event.actorId === actorId && event.data.displayName === displayName &&
      event.data.status === input.status && event.data.reason === reason);
    if (prior) return prior;
    const items = projectMinistryAreas(snapshot.events);
    const existing = items.find(item => item.ministryAreaId === ministryAreaId);
    if (!existing) return failure(404, "Ministry Area not found");
    if (displayName !== undefined && nameConflict(items, displayName, ministryAreaId)) {
      return failure(409, "Ministry Area display name is already in use");
    }
    if ((displayName === undefined || displayName === existing.displayName) &&
        (input.status === undefined || input.status === existing.status)) {
      return failure(400, "No Ministry Area field would change");
    }
    const event: MinistryAreaEvent = {
      eventId, ministryAreaId, type: "ministryArea.updated", occurredAt, actorId,
      sequence: snapshot.revision + 1,
      data: {
        ...(displayName === undefined ? {} : { displayName }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(reason === undefined ? {} : { reason })
      }
    };
    if (await repository.appendIfVersion(event, snapshot.version)) return accepted(event);
  }
  return failure(409, "Ministry Area changed during the command; retry with the same commandId");
}

export async function readMinistryAreas(
  repository: Pick<MinistryAreaEventsRepository, "readSnapshot"> = new MinistryAreaEventsRepository()
): Promise<CanonicalMinistryArea[]> {
  return projectMinistryAreas((await repository.readSnapshot()).events);
}

export async function readMinistryAreaAudit(ministryAreaId: string,
  repository: Pick<MinistryAreaEventsRepository, "readSnapshot"> = new MinistryAreaEventsRepository()
): Promise<MinistryAreaEvent[]> {
  return (await repository.readSnapshot()).events
    .filter(event => event.ministryAreaId === ministryAreaId)
    .sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0) ||
      b.occurredAt.localeCompare(a.occurredAt) || b.eventId.localeCompare(a.eventId));
}
