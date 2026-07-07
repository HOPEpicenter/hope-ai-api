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