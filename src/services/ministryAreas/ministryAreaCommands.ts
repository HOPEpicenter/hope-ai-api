import { randomUUID } from "crypto";
import {
  ministryAreaNameKey,
  normalizeLeaderStaffIds,
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
import type {
  CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import {
  readCanonicalStaffIdentity
} from "../staff/readCanonicalStaffDirectory";

type Repository = Pick<MinistryAreaEventsRepository, "readSnapshot" | "appendIfVersion">;
export type MinistryAreaCommandDependencies = {
  repository?: Repository;
  now?: () => string;
  newMinistryAreaId?: () => string;
  readStaffIdentity?: (
    staffId: string
  ) => Promise<CanonicalStaffIdentity | null>;
};

export type MinistryAreaCommandInput = {
  commandId: string;
  actorId: string;
  ministryAreaId?: string;
  displayName?: string;
  status?: MinistryAreaStatus;
  leaderStaffId?: string | null;
  leaderStaffIds?: string[];
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

async function validateLeaderStaff(
  value: string | null | undefined,
  deps: MinistryAreaCommandDependencies
): Promise<
  | { ok: true; leaderStaffId: string | null | undefined }
  | { ok: false; status: number; error: string }
> {
  if (value === undefined || value === null) {
    return {
      ok: true,
      leaderStaffId: value
    };
  }

  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false,
      status: 400,
      error: "leaderStaffId must be a nonempty Staff ID or null"
    };
  }

  const leaderStaffId = value.trim();

  const read =
    deps.readStaffIdentity ?? readCanonicalStaffIdentity;

  const staff = await read(leaderStaffId);

  if (!staff) {
    return {
      ok: false,
      status: 404,
      error: "Leader Staff identity not found"
    };
  }

  if (staff.status !== "active") {
    return {
      ok: false,
      status: 409,
      error: "Leader Staff identity is inactive"
    };
  }

  return {
    ok: true,
    leaderStaffId
  };
}

async function validateLeaderStaffIds(
  value: string[] | undefined,
  deps: MinistryAreaCommandDependencies
): Promise<
  | { ok: true; leaderStaffIds: string[] | undefined }
  | { ok: false; status: number; error: string }
> {
  if (value === undefined) {
    return { ok: true, leaderStaffIds: undefined };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      status: 400,
      error: "leaderStaffIds must be an array of Staff IDs"
    };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (!id) {
      return {
        ok: false,
        status: 400,
        error: "leaderStaffIds entries must be nonempty Staff IDs"
      };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  const read = deps.readStaffIdentity ?? readCanonicalStaffIdentity;

  for (const id of normalized) {
    const staffMember = await read(id);

    if (!staffMember) {
      return {
        ok: false,
        status: 404,
        error: `Leader Staff identity not found: ${id}`
      };
    }

    if (staffMember.status !== "active") {
      return {
        ok: false,
        status: 409,
        error: `Leader Staff identity is not active: ${id}`
      };
    }
  }

  return { ok: true, leaderStaffIds: normalized };
}

type LeaderIntent = "none" | "ids" | "legacy";

function leaderIntentOf(data: MinistryAreaEvent["data"]): LeaderIntent {
  if (data.leaderStaffIds !== undefined) return "ids";
  if (data.leaderStaffId !== undefined) return "legacy";
  return "none";
}

function effectiveLeaderIdsOf(data: MinistryAreaEvent["data"]): string[] {
  if (data.leaderStaffIds !== undefined) return normalizeLeaderStaffIds(data.leaderStaffIds);
  if (data.leaderStaffId !== undefined) {
    const id = String(data.leaderStaffId ?? "").trim();
    return id ? [id] : [];
  }
  return [];
}

function leaderIdsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
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
  if (input.leaderStaffIds !== undefined && input.leaderStaffId !== undefined) {
    return failure(
      400,
      "Provide either leaderStaffIds or leaderStaffId, not both"
    );
  }
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
  if (
    displayName === undefined &&
    input.status === undefined &&
    input.leaderStaffId === undefined &&
    input.leaderStaffIds === undefined
  ) {
    return failure(
      400,
      "displayName, status, leaderStaffId, or leaderStaffIds is required"
    );
  }
  const reason = input.reason === undefined ? undefined : String(input.reason ?? "").trim() || null;
  if (reason && reason.length > 500) return failure(400, "reason must contain at most 500 characters");

  const leaderIntent: LeaderIntent =
    input.leaderStaffIds !== undefined
      ? "ids"
      : input.leaderStaffId !== undefined
        ? "legacy"
        : "none";

  const normalizedLeaderStaffId =
    input.leaderStaffId === undefined || input.leaderStaffId === null
      ? input.leaderStaffId
      : typeof input.leaderStaffId === "string"
        ? input.leaderStaffId.trim()
        : input.leaderStaffId;

  const requestedLeaderIds =
    leaderIntent === "ids"
      ? normalizeLeaderStaffIds(input.leaderStaffIds)
      : leaderIntent === "legacy"
        ? (normalizedLeaderStaffId ? [String(normalizedLeaderStaffId)] : [])
        : [];

  const actorId = input.actorId.trim();
  const eventId = `evt-${input.commandId.toLowerCase()}`;
  const repository = deps.repository ?? new MinistryAreaEventsRepository();
  const occurredAt = (deps.now ?? (() => new Date().toISOString()))();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const snapshot = await repository.readSnapshot();
    const prior = existingCommand(snapshot, eventId, event => {
      if (
        event.type !== "ministryArea.updated" ||
        event.ministryAreaId !== ministryAreaId ||
        event.actorId !== actorId ||
        event.data.displayName !== displayName ||
        event.data.status !== input.status ||
        event.data.reason !== reason
      ) {
        return false;
      }

      if (leaderIntentOf(event.data) !== leaderIntent) return false;
      if (leaderIntent === "none") return true;

      return leaderIdsEqual(effectiveLeaderIdsOf(event.data), requestedLeaderIds);
    });
    if (prior) return prior;

    let leaderStaffIds: string[] | undefined;
    let legacyLeaderStaffId: string | null | undefined;

    if (leaderIntent === "ids") {
      const validated = await validateLeaderStaffIds(input.leaderStaffIds, deps);
      if (!validated.ok) return failure(validated.status, validated.error);
      leaderStaffIds = validated.leaderStaffIds;
    } else if (leaderIntent === "legacy") {
      const leader = await validateLeaderStaff(input.leaderStaffId, deps);
      if (!leader.ok) return failure(leader.status, leader.error);
      legacyLeaderStaffId = leader.leaderStaffId;
    }

    const items = projectMinistryAreas(snapshot.events);
    const existing = items.find(item => item.ministryAreaId === ministryAreaId);
    if (!existing) return failure(404, "Ministry Area not found");
    if (displayName !== undefined && nameConflict(items, displayName, ministryAreaId)) {
      return failure(409, "Ministry Area display name is already in use");
    }

    const effectiveLeaderStaffIds =
      leaderIntent === "ids"
        ? (leaderStaffIds as string[])
        : leaderIntent === "legacy"
          ? (legacyLeaderStaffId ? [String(legacyLeaderStaffId)] : [])
          : existing.leaderStaffIds;

    if (
      (displayName === undefined || displayName === existing.displayName) &&
      (input.status === undefined || input.status === existing.status) &&
      (
        leaderIntent === "none" ||
        leaderIdsEqual(effectiveLeaderStaffIds, existing.leaderStaffIds)
      )
    ) {
      return failure(400, "No Ministry Area field would change");
    }
    const event: MinistryAreaEvent = {
      eventId, ministryAreaId, type: "ministryArea.updated", occurredAt, actorId,
      sequence: snapshot.revision + 1,
      data: {
        ...(displayName === undefined ? {} : { displayName }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(leaderIntent === "ids" ? { leaderStaffIds } : {}),
        ...(leaderIntent === "legacy" ? { leaderStaffId: legacyLeaderStaffId } : {}),
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
