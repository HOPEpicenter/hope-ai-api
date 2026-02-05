import { EngagementEventEnvelopeV1, validateEngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";

export class FormationService {
  constructor(private repo: AzureTableFormationEventsRepository) {}

  async appendEvent(raw: unknown): Promise<void> {
    const validated = validateEngagementEventEnvelopeV1(raw);
    if (!validated.ok) {
      const err: any = new Error("Validation failed");
      err.statusCode = 400;
      err.details = validated.issues;
      throw err;
    }

    const evt = validated.value as EngagementEventEnvelopeV1;

    // Map envelope -> existing formation repo append contract
    await this.repo.append({
      id: evt.eventId,
      visitorId: evt.visitorId,
      type: evt.type,
      occurredAt: evt.occurredAt,
      source: evt.source,
      data: evt.data ?? {},
    } as any);
  }

  async readTimeline(visitorId: string, limit: number, cursor?: string) {
    const page: any = await this.repo.listByVisitor({
      visitorId,
      limit,
      cursor,
    } as any);

    return {
      items: page.items ?? [],
      nextCursor: page.nextCursor ?? page.cursor ?? null,
    };
  }
}
