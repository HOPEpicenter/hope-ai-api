import { EngagementEventEnvelopeV1, validateEngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
<<<<<<< HEAD
import { deriveEngagementStatusFromEvents } from "../../domain/engagement/deriveEngagementStatus.v1";
=======
>>>>>>> a9b28ba (feat(engagement): envelope v1 + timeline v1 (no deps))

export class EngagementsService {
  constructor(private repo: EngagementEventsRepository) {}

  async appendEvent(raw: unknown): Promise<void> {
    const validated = validateEngagementEventEnvelopeV1(raw);
    if (!validated.ok) {
      const err: any = new Error("Validation failed");
      err.statusCode = 400;
      err.details = validated.issues;
      throw err;
    }

    const evt = validated.value;
<<<<<<< HEAD
=======

>>>>>>> a9b28ba (feat(engagement): envelope v1 + timeline v1 (no deps))
    await this.repo.appendEvent(evt as EngagementEventEnvelopeV1);
  }

  async readTimeline(visitorId: string, limit: number, cursor?: string) {
    return this.repo.readTimeline(visitorId, limit, cursor);
  }
<<<<<<< HEAD

  /**
   * Status v1 is derived from status.transition events (auditable/derivable).
   * Minimal implementation: read up to 200 events and derive.
   */
  async getCurrentStatus(visitorId: string) {
    const page = await this.repo.readTimeline(visitorId, 200, undefined);

    // Repo returns ascending RowKey order (oldest -> newest).
    const events = page.items;

    return deriveEngagementStatusFromEvents(visitorId, events);
  }
=======
>>>>>>> a9b28ba (feat(engagement): envelope v1 + timeline v1 (no deps))
}
