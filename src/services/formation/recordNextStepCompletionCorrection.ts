import type { TableClient, TransactionAction } from "@azure/data-tables";
import {
  CorrectionReplayUnavailableError,
  ensureTable,
  getFormationEventsTableClient,
  listFormationEventsByVisitorId,
  NEXT_STEP_CORRECTION_GUARD_ROW_PREFIX,
  type FunctionFormationEventEntity
} from "../../functions/_shared/formation";
import {
  NEXT_STEP_COMPLETION_CORRECTED,
  resolveEffectiveNextStepCompletionEvents
} from "../../domain/formation/effectiveNextStepCompletionEvents";

const MAX_EVENTS = 10000;
const MAX_TARGETS = 16;
const commandRow = (id: string) =>
  NEXT_STEP_CORRECTION_GUARD_ROW_PREFIX + "command__" + id;
const targetRow = (id: string) =>
  NEXT_STEP_CORRECTION_GUARD_ROW_PREFIX + "target__" + id;

export class CorrectionCommandError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}

function bad(message: string): never {
  throw new CorrectionCommandError(400, "INVALID_CORRECTION", message);
}
function conflict(): never {
  throw new CorrectionCommandError(409, "CORRECTION_CONFLICT", "A correction already uses this command or target");
}

export type CorrectionInput = {
  visitorId: string;
  eventId: string;
  targetEventIds: string[];
  reason: string;
  actorId: string;
};

function validate(input: CorrectionInput): CorrectionInput {
  const visitorId = String(input.visitorId ?? "").trim();
  const eventId = String(input.eventId ?? "").trim();
  const actorId = String(input.actorId ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  if (!visitorId || !actorId || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) {
    bad("visitorId, actorId, and a safe eventId are required");
  }
  if (!reason || reason.length > 1000) bad("reason must contain 1–1000 characters");
  if (!Array.isArray(input.targetEventIds) ||
      input.targetEventIds.length < 1 ||
      input.targetEventIds.length > MAX_TARGETS) {
    bad("targetEventIds must contain 1–16 event IDs");
  }
  const targets = input.targetEventIds.map(id => String(id ?? "").trim());
  if (targets.some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id)) ||
      new Set(targets).size !== targets.length) {
    bad("targetEventIds must be distinct safe event IDs");
  }
  return { visitorId, eventId, actorId, reason, targetEventIds: targets.sort() };
}

type CorrectionResult = {
  accepted: boolean;
  eventId: string;
  visitorId: string;
  targetEventIds: string[];
  rowKey: string;
};

async function getCommand(table: TableClient, input: CorrectionInput): Promise<CorrectionResult | null> {
  let row: any;
  try {
    row = await table.getEntity<any>(input.visitorId, commandRow(input.eventId));
  } catch (error: any) {
    if (Number(error?.statusCode ?? error?.status) === 404) return null;
    throw error;
  }
  const targets = JSON.stringify(input.targetEventIds);
  if (row.actorId !== input.actorId || row.reason !== input.reason ||
      row.targetEventIds !== targets || !row.correctionRowKey) conflict();
  return {
    accepted: false,
    eventId: input.eventId,
    visitorId: input.visitorId,
    targetEventIds: input.targetEventIds,
    rowKey: String(row.correctionRowKey)
  };
}

/** Commits a correction event and all its guards in one Azure Table partition. */
export async function recordNextStepCompletionCorrection(
  untrusted: CorrectionInput,
  table: TableClient = getFormationEventsTableClient()
): Promise<CorrectionResult> {
  const input = validate(untrusted);
  await ensureTable(table);
  const prior = await getCommand(table, input);
  if (prior) return prior;

  const events = await listFormationEventsByVisitorId(table, {
    visitorId: input.visitorId,
    limit: MAX_EVENTS + 1
  });
  if (events.length > MAX_EVENTS) {
    throw new CorrectionReplayUnavailableError(input.visitorId);
  }

  // The command ID is reserved separately, but it must not reuse an existing
  // visitor event ID that could make the audit stream ambiguous.
  if (events.some(event => event.idempotencyKey === input.eventId)) conflict();

  const resolution = resolveEffectiveNextStepCompletionEvents(events);
  const completions = new Map<string, FunctionFormationEventEntity>();
  for (const event of events) {
    if (event.type !== "NEXT_STEP_COMPLETED" || event.visitorId !== input.visitorId) continue;
    const id = String(event.idempotencyKey ?? event.rowKey.split("__").pop() ?? "");
    if (completions.has(id)) conflict();
    completions.set(id, event);
  }
  for (const id of input.targetEventIds) {
    if (!completions.has(id) || resolution.correctedCompletionEventIds.includes(id)) {
      conflict();
    }
  }

  const occurredAt = new Date().toISOString();
  const rowKey = occurredAt + "__" + input.eventId;
  const correction = {
    partitionKey: input.visitorId,
    rowKey,
    visitorId: input.visitorId,
    type: NEXT_STEP_COMPLETION_CORRECTED,
    occurredAt,
    recordedAt: occurredAt,
    idempotencyKey: input.eventId,
    metadata: JSON.stringify({
      source: { system: "admin-next-step-correction", actorId: input.actorId },
      data: { targetEventIds: input.targetEventIds, reason: input.reason }
    }),
    summary: "Next-step completion corrected"
  };
  const marker = {
    partitionKey: input.visitorId,
    rowKey: commandRow(input.eventId),
    actorId: input.actorId,
    reason: input.reason,
    targetEventIds: JSON.stringify(input.targetEventIds),
    correctionRowKey: rowKey
  };
  const guards = input.targetEventIds.map(id => ({
    partitionKey: input.visitorId,
    rowKey: targetRow(id),
    correctionRowKey: rowKey
  }));
  const actions: TransactionAction[] = [
    ["create", correction],
    ["create", marker],
    ...guards.map((guard): TransactionAction => ["create", guard])
  ];

  try {
    await table.submitTransaction(actions);
  } catch (error: any) {
    if (Number(error?.statusCode ?? error?.status) === 409) {
      // Same command may have won a race. All other collisions are conflicts.
      const retry = await getCommand(table, input);
      if (retry) return retry;
      conflict();
    }
    throw error;
  }

  return {
    accepted: true,
    eventId: input.eventId,
    visitorId: input.visitorId,
    targetEventIds: input.targetEventIds,
    rowKey
  };
}
