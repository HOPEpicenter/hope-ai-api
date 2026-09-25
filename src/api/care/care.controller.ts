import { buildCareAlerts } from "../../domain/care/care.alerts";
import { buildCareAnalytics } from "../../domain/care/care.analytics";
import { getCareCoaching } from "../../domain/care/care.coaching";
import { buildCareInsights } from "../../domain/care/care.insights";
import { buildCareRecommendation } from "../../domain/care/care.intelligence";
import { buildCareMilestones } from "../../domain/care/care.milestones";
import { CareProfileIndex } from "../../domain/care/careProfile.index";
import { createInitialCareProfile } from "../../domain/care/careProfile.projection";
import { generateCareJourneyReport } from "../../domain/care/care.report";
import { buildCareTimeline } from "../../domain/care/care.timeline";

export class CareController {
  constructor(private readonly profiles: CareProfileIndex) {}
  private model(memberId: string) {
    const profile = this.profiles.getProfile(memberId) ?? createInitialCareProfile(memberId);
    const timeline = buildCareTimeline(profile, this.profiles.getEvents(memberId));
    const milestones = buildCareMilestones(timeline);
    const insights = buildCareInsights(profile);
    const recommendation = buildCareRecommendation(profile, insights);
    const analytics = buildCareAnalytics(this.profiles.getAllProfiles());
    const coaching = getCareCoaching(profile, milestones, insights, recommendation);
    return { profile, timeline, milestones, insights, recommendation, alerts: buildCareAlerts(profile, insights), analytics, coaching, report: generateCareJourneyReport({ profile, timeline, milestones, coaching, analytics }) };
  }
  public getProfile(memberId: string) { return this.model(memberId).profile; }
  public getTimeline(memberId: string) { return this.model(memberId).timeline; }
  public getMilestones(memberId: string) { return this.model(memberId).milestones; }
  public getInsights(memberId: string) { return this.model(memberId).insights; }
  public getRecommendations(memberId: string) { return this.model(memberId).recommendation; }
  public getAlerts(memberId: string) { return this.model(memberId).alerts; }
  public getAnalytics() { return buildCareAnalytics(this.profiles.getAllProfiles()); }
  public getCoaching(memberId: string) { return this.model(memberId).coaching; }
  public getReport(memberId: string) { return this.model(memberId).report; }
}