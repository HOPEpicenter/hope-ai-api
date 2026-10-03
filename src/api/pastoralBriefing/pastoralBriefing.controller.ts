import { buildDailyPastoralBriefing } from "../../domain/pastoralBriefing/pastoralBriefing.daily";
import { buildEventPastoralBriefings } from "../../domain/pastoralBriefing/pastoralBriefing.events";
import { buildPastoralBriefingInputs, type PastoralBriefingInputSource, type PastoralBriefingInputs } from "../../domain/pastoralBriefing/pastoralBriefing.inputs";
import { buildDailyPastoralBriefingReport, buildEventPastoralBriefingReport, buildWeeklyPastoralBriefingReport } from "../../domain/pastoralBriefing/pastoralBriefing.report";
import { buildWeeklyPastoralBriefing } from "../../domain/pastoralBriefing/pastoralBriefing.weekly";

const defaultInput: PastoralBriefingInputSource = { generatedAt: "1970-01-01T00:00:00.000Z", predictiveMemberIntelligence: [], workloadMemberPlans: [], memberJourneyNarrative: { tone: "pastoral", summary: "No journey evidence is currently available.", currentSeason: "There is not enough recorded evidence to describe a current season.", direction: "insufficient_data", pastoralResponse: "Review available records or connect personally before drawing a journey conclusion." }, memberJourneySummary: "No journey evidence is currently available.", ministryHealthSummary: { status: "insufficient_data", overallScore: null, alertCount: 0 }, ministryHealthAnalytics: { overallScore: null, status: "insufficient_data", scoresByDomain: {}, alertCount: 0, trendCounts: { insufficient_data: 7 } }, careCoaching: [], formationCoaching: [], servingCoaching: [], communityCoaching: [], givingCoaching: [], attendanceCoaching: [], engagementCoaching: [] };

export class PastoralBriefingController {
  constructor(private readonly input: PastoralBriefingInputs = buildPastoralBriefingInputs(defaultInput)) {}
  getDaily() { return buildDailyPastoralBriefing(this.input); }
  getWeekly() { return buildWeeklyPastoralBriefing(this.input); }
  getEvents() { return buildEventPastoralBriefings(this.input); }
  getDailyReport() { return buildDailyPastoralBriefingReport(this.input); }
  getWeeklyReport() { return buildWeeklyPastoralBriefingReport(this.input); }
  getEventsReport() { return buildEventPastoralBriefingReport(this.input); }
}