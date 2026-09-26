import { FormationProfileIndex } from "../../domain/formation/formationProfile.index";
import {
  createInitialFormationProfile,
  type FormationProfile
} from "../../domain/formation/formationProfile.projection";
import { toFormationProfileEvent } from "../../domain/formation/toFormationProfileEvent";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { listFormationEventsByVisitor } from "../../storage/formation/formationEventsRepo";
import { getFormationEventsTableClient } from "../../storage/formation/formationTables";

export type CanonicalFormationProfileRead = {
  profile: FormationProfile;
  hasQualifyingEvents: boolean;
};

export type CanonicalFormationProfileEventStore = {
  listByMemberId(memberId: string): Promise<readonly Record<string, unknown>[]>;
};

class AzureFormationProfileEventStore
  implements CanonicalFormationProfileEventStore {
  public async listByMemberId(
    memberId: string
  ): Promise<readonly Record<string, unknown>[]> {
    const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!storageConnectionString) {
      throw new Error("Missing STORAGE_CONNECTION_STRING");
    }

    const eventsTable = getFormationEventsTableClient(storageConnectionString);
    await ensureTableExists(eventsTable);
    return listFormationEventsByVisitor(eventsTable, memberId);
  }
}

export class CanonicalFormationProfileReader {
  constructor(
    private readonly eventStore: CanonicalFormationProfileEventStore =
      new AzureFormationProfileEventStore()
  ) {}

  public async readByMemberId(
    memberId: string
  ): Promise<CanonicalFormationProfileRead> {
    const entities = await this.eventStore.listByMemberId(memberId);
    const events = entities
      .map((entity) => toFormationProfileEvent(entity, memberId))
      .filter((event): event is NonNullable<typeof event> => event !== null)
      .sort((left, right) =>
        left.occurredAt.localeCompare(right.occurredAt)
        || left.eventId.localeCompare(right.eventId)
      );
    const profiles = new FormationProfileIndex();
    profiles.replayEvents(events);

    return {
      profile: profiles.getProfile(memberId)
        ?? createInitialFormationProfile(memberId),
      hasQualifyingEvents: events.length > 0
    };
  }
}