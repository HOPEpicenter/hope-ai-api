import { buildMemberJourneyAggregate, type MemberJourneyAggregateInput } from "./memberJourney.aggregate";
import { buildMemberJourneyInsights } from "./memberJourney.insights";
import { buildMemberJourneyNarrative } from "./memberJourney.narrative";
import { buildMemberJourneyRecommendations } from "./memberJourney.recommendations";
import { buildMemberJourneyReport, type MemberJourneyReport } from "./memberJourney.report";
export class MemberJourneyService { build(input: MemberJourneyAggregateInput, generatedAt?: string): MemberJourneyReport { const aggregate = buildMemberJourneyAggregate(input); const narrative = buildMemberJourneyNarrative(aggregate); const insights = buildMemberJourneyInsights(aggregate); const recommendations = buildMemberJourneyRecommendations(aggregate); return buildMemberJourneyReport(aggregate, narrative, insights, recommendations, generatedAt); } }