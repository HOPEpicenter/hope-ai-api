import type { EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";

export type PastoralNoteVersion = {
  eventId: string;
  occurredAt: string;
  actorId: string | null;
  text: string;
  visibility: "team" | "private";
  version: number;
  reason: string | null;
};

export type PastoralNoteProjection = {
  noteId: string;
  visitorId: string;
  text: string;
  visibility: "team" | "private";
  createdAt: string;
  createdBy: string | null;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  version: number;
  edited: boolean;
  history: PastoralNoteVersion[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asVisibility(value: unknown): "team" | "private" {
  const normalized = asString(value).toLowerCase();
  return normalized === "private" ? "private" : "team";
}

function asVersion(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null;
}

function compareOldestFirst(a: EngagementEventEnvelopeV1, b: EngagementEventEnvelopeV1): number {
  const at = Date.parse(a.occurredAt);
  const bt = Date.parse(b.occurredAt);

  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) {
    return at - bt;
  }

  return String(a.eventId ?? "").localeCompare(String(b.eventId ?? ""));
}

export function projectPastoralNotes(
  visitorId: string,
  events: EngagementEventEnvelopeV1[]
): PastoralNoteProjection[] {
  const notes = new Map<string, PastoralNoteProjection>();

  const ordered = [...events]
    .filter((event) => event?.visitorId === visitorId)
    .filter((event) => event?.type === "note.add" || event?.type === "note.updated")
    .sort(compareOldestFirst);

  for (const event of ordered) {
    const data = event.data ?? {};
    const noteId = asString((data as any).noteId);
    const text = asString((data as any).text);

    if (!noteId || !text) {
      continue;
    }

    const actorId = asString(event.source?.actorId) || null;
    const visibility = asVisibility((data as any).visibility);

    if (event.type === "note.add") {
      if (notes.has(noteId)) {
        continue;
      }

      notes.set(noteId, {
        noteId,
        visitorId,
        text,
        visibility,
        createdAt: event.occurredAt,
        createdBy: actorId,
        lastEditedAt: null,
        lastEditedBy: null,
        version: 1,
        edited: false,
        history: [
          {
            eventId: event.eventId,
            occurredAt: event.occurredAt,
            actorId,
            text,
            visibility,
            version: 1,
            reason: null
          }
        ]
      });

      continue;
    }

    const current = notes.get(noteId);
    if (!current) {
      continue;
    }

    const nextVersion = asVersion((data as any).version);
    if (nextVersion === null || nextVersion <= current.version) {
      continue;
    }

    const reason = asString((data as any).reason) || null;

    current.text = text;
    current.visibility = visibility;
    current.lastEditedAt = event.occurredAt;
    current.lastEditedBy = actorId;
    current.version = nextVersion;
    current.edited = true;
    current.history.push({
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      actorId,
      text,
      visibility,
      version: nextVersion,
      reason
    });
  }

  return [...notes.values()].sort((a, b) => {
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);

    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) {
      return bt - at;
    }

    return b.noteId.localeCompare(a.noteId);
  });
}