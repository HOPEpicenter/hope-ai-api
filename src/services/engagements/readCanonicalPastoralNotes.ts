import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import {
  PastoralNoteProjection,
  projectPastoralNotes
} from "../../domain/engagement/projectPastoralNotes";

export type CanonicalPastoralNotesResult = {
  ok: true;
  v: 1;
  visitorId: string;
  items: PastoralNoteProjection[];
};

export async function readCanonicalPastoralNotes(
  visitorId: string,
  repo = new EngagementEventsRepository()
): Promise<CanonicalPastoralNotesResult> {
  const all = [];
  const pageSize = 200;
  const maxEvents = 2000;
  let cursor: string | undefined = undefined;

  while (all.length < maxEvents) {
    const page = await repo.readTimeline(visitorId, pageSize, cursor);
    all.push(...page.items);

    if (!page.nextCursor) {
      break;
    }

    cursor = page.nextCursor;
  }

  return {
    ok: true,
    v: 1,
    visitorId,
    items: projectPastoralNotes(visitorId, all)
  };
}

export async function readCanonicalPastoralNote(
  visitorId: string,
  noteId: string,
  repo = new EngagementEventsRepository()
): Promise<PastoralNoteProjection | null> {
  const normalizedNoteId = typeof noteId === "string" ? noteId.trim() : "";

  if (!visitorId || !normalizedNoteId) {
    return null;
  }

  const result = await readCanonicalPastoralNotes(visitorId, repo);
  return result.items.find((note) => note.noteId === normalizedNoteId) ?? null;
}