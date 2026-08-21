import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { EngagementsService } from "../engagements/engagementsService";
import { readEngagementRiskV1 } from "../engagements/readEngagementRisk";
import { readSixWeekVisitorFollowup } from "../followups/readSixWeekVisitorFollowups";
import { IntegrationService } from "../integration/integrationService";
import {
  buildPersonAggregate,
  type PersonAggregateInputs
} from "../../domain/aggregation/buildPersonAggregate";

export type PersonAggregationDependencies = {
  readTimeline: (visitorId: string) => Promise<any[]>;
  readSummary: (visitorId: string) => Promise<any>;
  readRisk: (visitorId: string) => Promise<any>;
  readProfile: (visitorId: string) => Promise<any | null>;
  readSixWeekPlan: (visitorId: string) => Promise<any | null>;
  nowIso: () => string;
};

export class PersonAggregationService {
  constructor(private readonly dependencies: PersonAggregationDependencies) {}

  async readPersonAggregate(visitorId: string) {
    const normalizedVisitorId = String(visitorId ?? "").trim();
    if (!normalizedVisitorId) {
      throw new Error("visitorId is required");
    }

    const [integratedTimeline, integrationSummary, engagementRisk, formationProfile, sixWeekPlan] =
      await Promise.all([
        this.dependencies.readTimeline(normalizedVisitorId),
        this.dependencies.readSummary(normalizedVisitorId),
        this.dependencies.readRisk(normalizedVisitorId),
        this.dependencies.readProfile(normalizedVisitorId),
        this.dependencies.readSixWeekPlan(normalizedVisitorId)
      ]);

    const input: PersonAggregateInputs = {
      visitorId: normalizedVisitorId,
      generatedAt: this.dependencies.nowIso(),
      integratedTimeline,
      integrationSummary,
      engagementRisk,
      formationProfile,
      sixWeekPlan
    };

    return buildPersonAggregate(input);
  }
}

export function createPersonAggregationService(): PersonAggregationService {
  const engagementRepository = new EngagementEventsRepository();
  const integrationService = new IntegrationService(engagementRepository);
  const engagementsService = new EngagementsService(engagementRepository);

  return new PersonAggregationService({
    readTimeline: async visitorId =>
      (await integrationService.readIntegratedTimeline(visitorId, 200)).items ?? [],
    readSummary: visitorId => integrationService.readIntegrationSummary(visitorId),
    readRisk: visitorId => readEngagementRiskV1(engagementsService, visitorId, 14),
    readProfile: async visitorId => {
      const table = getFormationProfilesTableClient();
      await ensureTableExists(table);
      return getFormationProfile(table as any, visitorId);
    },
    readSixWeekPlan: visitorId => readSixWeekVisitorFollowup(visitorId),
    nowIso: () => new Date().toISOString()
  });
}