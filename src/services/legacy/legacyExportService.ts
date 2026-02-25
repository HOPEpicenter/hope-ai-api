import { AzureTableVisitorsRepository } from "../../repositories/visitorsRepository";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { FormationEventsRepository } from "../../repositories/formationEventsRepository";
import { mergeTimelines } from "../../domain/integration/mergeTimelines.v1";
import { makeStableKey } from "../../domain/integration/mergeTimelines.v1";
import { EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";

export type LegacyExportV1 = {
  v: 1;
  visitorId: string;
  visitor: any | null;
  engagement: { v: 1; items: EngagementEventEnvelopeV1[]; nextCursor: null; limit: number };
  formation: { v: 1; items: EngagementEventEnvelopeV1[]; nextCursor: null; limit: number };
  integration: { v: 1; items: (EngagementEventEnvelopeV1 & { stream: "engagement" | "formation" })[]; nextCursor: null; limit: number };
};

export class LegacyExportService {
  constructor(
    private visitorsRepo: AzureTableVisitorsRepository,
    private engagementRepo: EngagementEventsRepository,
    private formationRepo: FormationEventsRepository
  ) {}

  /**
   * Export is intentionally bounded/predictable (no unbounded scans).
   * Default cap is 500 per stream (change only if needed later).
   */
  async exportVisitor(visitorId: string, limitPerStream: number): Promise<LegacyExportV1> {
    const limit = Math.max(1, Math.min(limitPerStream || 500, 1000));

    const visitor = await this.visitorsRepo.getById(visitorId);

    const engagementPage = await this.engagementRepo.readTimeline(visitorId, limit, undefined);
    const formationPage: any = await this.formationRepo.listByVisitor({ visitorId, limit, cursor: undefined } as any);

    const engagementItems = (engagementPage.items ?? []) as EngagementEventEnvelopeV1[];
    const formationItems = (formationPage.items ?? []) as EngagementEventEnvelopeV1[];

    const integrationItems = mergeTimelines(engagementItems, formationItems)
      .sort((x, y) => makeStableKey(x).localeCompare(makeStableKey(y)));

    return {
      v: 1,
      visitorId,
      visitor: visitor ?? null,
      engagement: { v: 1, items: engagementItems, nextCursor: null, limit },
      formation: { v: 1, items: formationItems, nextCursor: null, limit },
      integration: { v: 1, items: integrationItems, nextCursor: null, limit },
    };
  }
}

