import type { VisitorEvent } from "./resolveVisitorEventContext";

/**
 * Internal event-update contract.
 *
 * Only a future authorized administrative route may call this command.
 * The expectedVersion protects against concurrent updates.
 *
 * The storage writer and permanent command ledger are NOT connected yet.
 */

export type VersionedVisitorEvent = {
  event: VisitorEvent;
  version: string;
  lastCommandId?: string;
  lastCommandFingerprint?: string;
};

export type VisitorEventUpdateRepository = {
  readCommand: (commandId: string) => Promise<{
    eventId: string;
    fingerprint: string;
    active: boolean;
  } | null>;
  read: (eventId: string) =>
    Promise<VersionedVisitorEvent | null>;
  updateIfVersion: (
    event: VisitorEvent,
    version: string,
    commandId: string,
    fingerprint: string
  ) => Promise<boolean>;
};

export type UpdateVisitorEventInput = {
  commandId: string;
  actorId: string;
  eventId: string;
  date?: string;
  name?: string;
  active?: boolean;
};

export type UpdateVisitorEventResult =
  | {
      accepted: true;
      eventId: string;
      replay: boolean;
      active: boolean;
    }
  | {
      accepted: false;
      status: 400 | 404 | 409;
      error: string;
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function invalid(error: string): UpdateVisitorEventResult {
  return { accepted: false, status: 400, error };
}

export async function updateVisitorEvent(
  input: UpdateVisitorEventInput,
  repository: VisitorEventUpdateRepository
): Promise<UpdateVisitorEventResult> {
  if (!input ||
      typeof input.commandId !== "string" ||
      !UUID.test(input.commandId)) {
    return invalid("invalid_command");
  }

  if (typeof input.actorId !== "string" ||
      !input.actorId.trim()) {
    return invalid("invalid_actor");
  }

  if (typeof input.eventId !== "string" ||
      !ID.test(input.eventId)) {
    return invalid("invalid_event_id");
  }

  if (
    input.date === undefined &&
    input.name === undefined &&
    input.active === undefined
  ) {
    return invalid("missing_changes");
  }

  if (input.date !== undefined &&
      (typeof input.date !== "string" ||
       !validDate(input.date))) {
    return invalid("invalid_date");
  }

  if (input.name !== undefined &&
      (typeof input.name !== "string" ||
       !input.name.trim() ||
       input.name.trim().length > 120)) {
    return invalid("invalid_name");
  }

  if (input.active !== undefined &&
      typeof input.active !== "boolean") {
    return invalid("invalid_status");
  }

  const commandId = input.commandId.toLowerCase();
  const actorId = input.actorId.trim();
  const requestedName =
    input.name === undefined ? undefined : input.name.trim();

  // Stable fingerprint of the exact administrative intent.
  const fingerprint = JSON.stringify({
    eventId: input.eventId,
    actorId,
    date: input.date ?? null,
    name: requestedName ?? null,
    active: input.active ?? null
  });

  // Check the permanent command ledger before reading current event state.
  // A historical retry must never apply its change a second time.
  const previous = await repository.readCommand(commandId);

  if (previous) {
    if (previous.eventId !== input.eventId ||
        previous.fingerprint !== fingerprint) {
      return {
        accepted: false,
        status: 409,
        error: "event_command_conflict"
      };
    }

    return {
      accepted: true,
      eventId: previous.eventId,
      replay: true,
      active: previous.active
    };
  }

  const snapshot = await repository.read(input.eventId);

  if (!snapshot) {
    return {
      accepted: false,
      status: 404,
      error: "event_not_found"
    };
  }

  // An event head claiming this command without its permanent
  // ledger entry is inconsistent and must not be trusted.
  if (snapshot.lastCommandId === commandId) {
    return {
      accepted: false,
      status: 409,
      error: "event_command_history_missing"
    };
  }

  // Historical-command protection requires the future durable ledger.
  // Until then, inactive events may not be reactivated by this command.
  if (!snapshot.event.active) {
    return {
      accepted: false,
      status: 409,
      error: "inactive_event_cannot_be_modified"
    };
  }

  const updated: VisitorEvent = {
    id: snapshot.event.id,
    date: input.date ?? snapshot.event.date,
    name: requestedName ?? snapshot.event.name,
    active: input.active ?? snapshot.event.active
  };

  if (
    updated.date === snapshot.event.date &&
    updated.name === snapshot.event.name &&
    updated.active === snapshot.event.active
  ) {
    return invalid("no_changes");
  }

  // A competing update must not be silently overwritten.
  const saved = await repository.updateIfVersion(
    updated,
    snapshot.version,
    commandId,
    fingerprint
  );

  if (!saved) {
    return {
      accepted: false,
      status: 409,
      error: "event_changed_retry_with_new_command"
    };
  }

  return {
    accepted: true,
    eventId: updated.id,
    replay: false,
    active: updated.active
  };
}