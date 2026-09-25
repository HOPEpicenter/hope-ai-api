import type { Request, Response } from "express";
import type { FormationEvent } from "../../contracts/formationEvent.v1";
import { FormationProfileIndex } from "../../domain/formation/formationProfile.index";
import { createInitialFormationProfile } from "../../domain/formation/formationProfile.projection";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import {
  listFormationEventsByVisitor
} from "../../storage/formation/formationEventsRepo";
import { getFormationEventsTableClient } from "../../storage/formation/formationTables";

const formationProfileEventTypes = new Set<FormationEvent["type"]>([
  "PathwayStarted",
  "StepCompleted",
  "StepStalledDetected",
  "PathwayCompleted"
]);

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata === "object" && metadata !== null) {
    return metadata as Record<string, unknown>;
  }

  if (typeof metadata !== "string" || !metadata.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata);
    return typeof parsed === "object" && parsed !== null
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function toFormationProfileEvent(
  entity: Record<string, unknown>,
  memberId: string
): FormationEvent | null {
  const type = stringValue(entity.type);
  const occurredAt = stringValue(entity.occurredAt);
  const eventId = stringValue(entity.id)
    ?? stringValue(entity.idempotencyKey)
    ?? stringValue(entity.rowKey);
  const metadata = parseMetadata(entity.metadata);
  const pathwayId = stringValue(entity.pathwayId) ?? stringValue(metadata?.pathwayId);
  const payload = metadata?.payload && typeof metadata.payload === "object"
    ? metadata.payload as Record<string, unknown>
    : metadata;

  if (
    !type ||
    !formationProfileEventTypes.has(type as FormationEvent["type"]) ||
    !occurredAt ||
    !pathwayId ||
    !eventId ||
    !payload
  ) {
    return null;
  }

  const base = { eventId, occurredAt, source: "api" as const, memberId, pathwayId };

  switch (type) {
    case "PathwayStarted": {
      const pathwayType = stringValue(payload.pathwayType);
      const startedAt = stringValue(payload.startedAt);
      const initialStepId = stringValue(payload.initialStepId);
      return pathwayType && startedAt && initialStepId
        ? { ...base, type, payload: { pathwayType, startedAt, initialStepId } }
        : null;
    }
    case "StepCompleted": {
      const stepId = stringValue(payload.stepId);
      const completedAt = stringValue(payload.completedAt);
      const notes = stringValue(payload.notes) ?? undefined;
      return stepId && completedAt
        ? { ...base, type, payload: { stepId, completedAt, notes } }
        : null;
    }
    case "StepStalledDetected": {
      const stepId = stringValue(payload.stepId);
      const stalledSince = stringValue(payload.stalledSince);
      const reason = stringValue(payload.reason) ?? undefined;
      return stepId && stalledSince
        ? { ...base, type, payload: { stepId, stalledSince, reason } }
        : null;
    }
    case "PathwayCompleted": {
      const completedAt = stringValue(payload.completedAt);
      const finalStepId = stringValue(payload.finalStepId);
      return completedAt && finalStepId
        ? { ...base, type, payload: { completedAt, finalStepId } }
        : null;
    }
    default:
      return null;
  }
}

export function createGetVisitorFormationProfileAdapter() {
  return async function getVisitorFormationProfile(req: Request, res: Response) {
    const memberId = String(req.params.id ?? "").trim();
    const requestId = (req as any).requestId as string | undefined;
    const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;

    if (!storageConnectionString) {
      return res.status(500).json({ ok: false, error: "Missing STORAGE_CONNECTION_STRING" });
    }

    const eventsTable = getFormationEventsTableClient(storageConnectionString);
    await ensureTableExists(eventsTable);
    const entities = await listFormationEventsByVisitor(
      eventsTable as any,
      memberId
    );
    const events = entities
      .map((entity) => toFormationProfileEvent(entity as Record<string, unknown>, memberId))
      .filter((event): event is FormationEvent => event !== null)
      .sort((left, right) =>
        left.occurredAt.localeCompare(right.occurredAt)
        || left.eventId.localeCompare(right.eventId)
      );
    const profiles = new FormationProfileIndex();
    profiles.replayEvents(events);

    return res.json({
      ok: true,
      requestId,
      memberId,
      profile: profiles.getProfile(memberId) ?? createInitialFormationProfile(memberId)
    });
  };
}