import { requireApiKeyForFunction } from "./_shared/apiKey";
import {
  ensureFormationTables,
  getFormationEventsTableClient,
  getFormationProfilesTableClient,
  getFormationProfileByVisitorId,
  recordFormationEventV1
} from "./_shared/formation";
import { getVisitorById } from "./_shared/visitorsRepository";
import { getOpportunitySegmentDefinition } from "../services/intelligence/opportunitySegments";
import { applyActivityIntelligenceResolution } from "../services/followups/applyActivityIntelligenceResolution";
import { readMutationActorStaffIdentity, readCanonicalStaffIdentity } from "../services/staff/readCanonicalStaffDirectory";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../shared/observability/functionObservability";

const EVENT_ID_PATTERN = /^(evt-[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

type ResolutionRequest = {
  eventId: string;
  actorId: string;
  resolution: Record<string, unknown>;
};

type ResolutionCommand = {
  type: "NEXT_STEP_SELECTED" | "NEXT_STEP_COMPLETED" | "FOLLOWUP_OUTCOME_RECORDED" | "FOLLOWUP_ASSIGNED";
  data: Record<string, string>;
};

function respond(context: any, status: number, body: Record<string, unknown>): void {
  context.res = {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateBody(body: unknown): { ok: true; value: ResolutionRequest } | { ok: false; error: string } {
  const input = asObject(body);
  if (!input) {
    return { ok: false, error: "body must be an object" };
  }

  const eventId = readNonEmptyString(input.eventId);
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return { ok: false, error: "eventId must match evt-<32hex> or UUID" };
  }

  const actorId = readNonEmptyString(input.actorId);
  if (!actorId || actorId.length > 128) {
    return { ok: false, error: "actorId must be a string (1-128 chars)" };
  }

  const resolution = asObject(input.resolution);
  if (!resolution) {
    return { ok: false, error: "resolution must be an object" };
  }

  return { ok: true, value: { eventId, actorId, resolution } };
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function parseEventMetadata(value: unknown): { source?: Record<string, unknown>; data?: Record<string, unknown> } {
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return asObject(parsed) ?? {};
  } catch {
    return {};
  }
}

async function findExistingEvent(eventId: string): Promise<any | null> {
  const table = getFormationEventsTableClient();
  const filter = `idempotencyKey eq '${escapeOData(eventId)}'`;

  for await (const entity of table.listEntities<any>({
    queryOptions: {
      filter,
      select: [
        "PartitionKey",
        "RowKey",
        "visitorId",
        "type",
        "occurredAt",
        "metadata",
        "idempotencyKey"
      ]
    }
  })) {
    return entity;
  }

  return null;
}

function sameRecord(existing: any, input: {
  visitorId: string;
  command: ResolutionCommand;
  actorId: string;
}): boolean {
  const metadata = parseEventMetadata(existing.metadata);
  const existingVisitorId = String(existing.visitorId ?? existing.partitionKey ?? "").trim();
  const existingActorId = readNonEmptyString(metadata.source?.actorId);
  const existingData = metadata.data ?? {};

  return existingVisitorId === input.visitorId &&
    String(existing.type ?? "").trim() === input.command.type &&
    existingActorId === input.actorId &&
    JSON.stringify(existingData) === JSON.stringify(input.command.data);
}

function buildCommand(
  segment: string,
  resolution: Record<string, unknown>,
  profile: Record<string, any>
): ResolutionCommand | { error: string } {
  switch (segment) {
    case "connected-without-next-step": {
      const nextStep = readNonEmptyString(resolution.nextStep);
      return nextStep
        ? { type: "NEXT_STEP_SELECTED", data: { nextStep } }
        : { error: "resolution.nextStep is required" };
    }
    case "active-care-without-outcome": {
      const outcome = readNonEmptyString(resolution.outcome);
      return outcome
        ? { type: "FOLLOWUP_OUTCOME_RECORDED", data: { outcome } }
        : { error: "resolution.outcome is required" };
    }
    case "next-step-selected-not-completed": {
      const nextStep = readNonEmptyString(resolution.nextStep) || readNonEmptyString(profile.lastNextStep);
      return nextStep
        ? { type: "NEXT_STEP_COMPLETED", data: { nextStep } }
        : { error: "resolution.nextStep is required because no selected next step exists" };
    }
    case "connected-without-care-owner": {
      const assignedTo = readNonEmptyString(resolution.assignedTo);
      return assignedTo
        ? { type: "FOLLOWUP_ASSIGNED", data: { assigneeId: assignedTo } }
        : { error: "resolution.assignedTo is required" };
    }
    default:
      return { error: "Unsupported opportunity segment" };
  }
}

function isOpenOpportunity(segment: string, profile: Record<string, any>): boolean {
  const stage = readNonEmptyString(profile.stage);
  const hasNextStep = Boolean(readNonEmptyString(profile.lastNextStepAt));
  const hasCompletedNextStep = Boolean(readNonEmptyString(profile.lastNextStepCompletedAt));
  const hasCareOwner = Boolean(readNonEmptyString(profile.assignedTo));
  const hasOutcome = Boolean(readNonEmptyString(profile.lastFollowupOutcomeAt));

  switch (segment) {
    case "connected-without-next-step":
      return stage === "Connected" && !hasNextStep;
    case "active-care-without-outcome":
      return hasCareOwner && !hasOutcome;
    case "next-step-selected-not-completed":
      return hasNextStep && !hasCompletedNextStep;
    case "connected-without-care-owner":
      return stage === "Connected" && !hasCareOwner;
    default:
      return false;
  }
}

export async function postActivityIntelligenceResolve(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      respond(context, auth.status, auth.body);
      return;
    }

    if (!readNonEmptyString(req?.staffPrincipalId)) {
      respond(context, 401, { ok: false, error: "staff_identity_required" });
      return;
    }

    const segment = readNonEmptyString(req?.params?.segment);
    const visitorId = readNonEmptyString(req?.params?.visitorId);
    const definition = getOpportunitySegmentDefinition(segment);
    if (!definition || !visitorId) {
      respond(context, 400, {
        ok: false,
        requestId,
        error: !definition ? "Unsupported opportunity segment" : "visitorId is required"
      });
      return;
    }

    const validated = validateBody(req?.body);
    if (!validated.ok) {
      respond(context, 400, { ok: false, requestId, error: validated.error });
      return;
    }

    const actorIdentity = await readMutationActorStaffIdentity(validated.value.actorId);
    if (!actorIdentity || actorIdentity.status !== "active") {
      respond(context, 400, {
        ok: false,
        requestId,
        error: "actorId must reference an active staff identity"
      });
      return;
    }

    const visitor = await getVisitorById(visitorId);
    if (!visitor) {
      respond(context, 404, { ok: false, requestId, error: "not found" });
      return;
    }

    const commandProfile = await getFormationProfileByVisitorId(
      getFormationProfilesTableClient(),
      visitorId
    );
    const command = buildCommand(segment, validated.value.resolution, commandProfile ?? {});
    if ("error" in command) {
      respond(context, 400, { ok: false, requestId, error: command.error });
      return;
    }

    const existingEvent = await findExistingEvent(validated.value.eventId);
    if (existingEvent) {
      if (!sameRecord(existingEvent, { visitorId, command, actorId: validated.value.actorId })) {
        respond(context, 409, { ok: false, requestId, error: "eventId already used" });
        return;
      }

      const sixWeekSync = await applyActivityIntelligenceResolution({
        visitorId,
        eventId: validated.value.eventId,
        actorId: validated.value.actorId,
        type: command.type,
        data: command.data,
        skipSixWeekSync: validated.value.resolution.skipSixWeekSync === true
      });

      respond(context, 200, {
        ok: true,
        requestId,
        accepted: true,
        idempotentReplay: true,
        segment,
        visitorId,
        eventId: validated.value.eventId,
        status: "resolved",
        sixWeekSync
      });
      return;
    }

    if (!isOpenOpportunity(segment, commandProfile ?? {})) {
      respond(context, 422, {
        ok: false,
        requestId,
        error: "Opportunity is no longer open"
      });
      return;
    }

    if (command.type === "FOLLOWUP_ASSIGNED") {
      const assignee = await readCanonicalStaffIdentity(command.data.assigneeId);
      if (!assignee || assignee.status !== "active") {
        respond(context, 422, {
          ok: false,
          requestId,
          error: "resolution.assignedTo must reference an active staff identity"
        });
        return;
      }
    }

    await ensureFormationTables();
    const occurredAt = new Date().toISOString();
    const result = await recordFormationEventV1({
      v: 1,
      eventId: validated.value.eventId,
      visitorId,
      type: command.type,
      occurredAt,
      source: {
        system: "hope-activity-intelligence",
        actorId: validated.value.actorId
      },
      data: command.data
    });

    const sixWeekSync = await applyActivityIntelligenceResolution({
      visitorId,
      eventId: validated.value.eventId,
      actorId: validated.value.actorId,
      type: command.type,
      data: command.data,
      skipSixWeekSync: validated.value.resolution.skipSixWeekSync === true
    });

    respond(context, 200, {
      ok: true,
      requestId,
      accepted: result.accepted,
      idempotentReplay: !result.accepted,
      segment,
      visitorId,
      eventId: validated.value.eventId,
      status: "resolved",
      resolvedAt: occurredAt,
      sixWeekSync,
      item: {
        status: "resolved",
        visitorId
      }
    });
  } catch (err: any) {
    logFunctionError(context, "postActivityIntelligenceResolve", err, {
      requestId,
      segment: req?.params?.segment ?? null,
      visitorId: req?.params?.visitorId ?? null,
      eventId: req?.body?.eventId ?? null
    });

    respond(context, 500, apiErrorBody(
      "POST_ACTIVITY_INTELLIGENCE_RESOLVE_FAILED",
      "Unexpected activity intelligence resolution error",
      requestId
    ));
  }
}
