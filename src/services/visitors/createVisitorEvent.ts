import type { VisitorEvent } from "./resolveVisitorEventContext";

/**
 * Canonical event creation command.
 *
 * SECURITY: The caller MUST be an authenticated, authorized Staff
 * administration route. This service does not authenticate callers.
 * Never expose it directly to public check-in requests.
 *
 * Storage implementation is injected and must provide atomic create.
 */

export type StoredVisitorEvent = VisitorEvent & {
  commandId: string;
  actorId: string;
};

export type VisitorEventWriter = {
  create: (record: StoredVisitorEvent) => Promise<"created" | "exists">;
  read: (date: string, id: string) =>
    Promise<StoredVisitorEvent | null>;
};

export type CreateVisitorEventInput = {
  commandId: string;
  actorId: string;
  date: string;
  name: string;
};

export type CreateVisitorEventResult =
  | { accepted: true; eventId: string; replay: boolean }
  | { accepted: false; status: 400 | 409; error: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

export async function createVisitorEvent(
  input: CreateVisitorEventInput,
  writer: VisitorEventWriter
): Promise<CreateVisitorEventResult> {
  if (!input || typeof input.commandId !== "string" ||
      !UUID.test(input.commandId)) {
    return { accepted: false, status: 400, error: "invalid_command" };
  }

  if (typeof input.actorId !== "string" ||
      !input.actorId.trim()) {
    return { accepted: false, status: 400, error: "invalid_actor" };
  }

  if (typeof input.date !== "string" ||
      !validDate(input.date)) {
    return { accepted: false, status: 400, error: "invalid_date" };
  }

  if (typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.trim().length > 120) {
    return { accepted: false, status: 400, error: "invalid_name" };
  }

  const commandId = input.commandId.toLowerCase();
  const id = `church-event-${commandId.replace(/-/g, "")}`;

  const record: StoredVisitorEvent = {
    id,
    commandId,
    actorId: input.actorId.trim(),
    date: input.date,
    name: input.name.trim(),
    active: true
  };

  // The repository must atomically create or report an existing row.
  const result = await writer.create(record);

  if (result === "created") {
    return { accepted: true, eventId: id, replay: false };
  }

  if (result !== "exists") {
    throw new Error("Unexpected canonical event writer result");
  }

  const existing = await writer.read(input.date, id);

  // A retry is accepted only for the exact same original command.
  if (
    existing?.id === record.id &&
    existing.commandId === record.commandId &&
    existing.actorId === record.actorId &&
    existing.date === record.date &&
    existing.name === record.name
  ) {
    return { accepted: true, eventId: id, replay: true };
  }

  return {
    accepted: false,
    status: 409,
    error: "event_command_conflict"
  };
}