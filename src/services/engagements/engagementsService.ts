import { EngagementEventEnvelopeV1, validateEngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";

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

    await this.repo.appendEvent(evt as EngagementEventEnvelopeV1);
  }

  async readTimeline(visitorId: string, limit: number, cursor?: string) {
    return this.repo.readTimeline(visitorId, limit, cursor);
  }
}
