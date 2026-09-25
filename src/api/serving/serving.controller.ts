import { buildServingAlerts } from "../../domain/serving/serving.alerts";
import { buildServingAnalytics } from "../../domain/serving/serving.analytics";
import { getServingCoaching } from "../../domain/serving/serving.coaching";
import { buildServingInsights } from "../../domain/serving/serving.insights";
import { buildServingRecommendation } from "../../domain/serving/serving.intelligence";
import { buildServingMilestones } from "../../domain/serving/serving.milestones";
import { ServingProfileIndex } from "../../domain/serving/servingProfile.index";
import { createInitialServingProfile } from "../../domain/serving/servingProfile.projection";
import { generateServingJourneyReport } from "../../domain/serving/serving.report";
import { buildServingTimeline } from "../../domain/serving/serving.timeline";

export class ServingController {
  constructor(private readonly profiles: ServingProfileIndex) {}
  private model(memberId: string) {
    const profile = this.profiles.getProfile(memberId) ?? createInitialServingProfile(memberId);
    const timeline = buildServingTimeline(profile, this.profiles.getEvents(memberId));
    const milestones = buildServingMilestones(timeline);
    const insights = buildServingInsights(profile);
    const recommendation = buildServingRecommendation(profile, insights);
    const analytics = buildServingAnalytics(this.profiles.getAllProfiles());
    const coaching = getServingCoaching(profile, milestones, insights, recommendation);
    return { profile, timeline, milestones, insights, recommendation, alerts: buildServingAlerts(profile, insights), analytics, coaching, report: generateServingJourneyReport({ profile, timeline, milestones, coaching, analytics }) };
  }
  public getProfile(memberId: string) { return this.model(memberId).profile; }
  public getTimeline(memberId: string) { return this.model(memberId).timeline; }
  public getMilestones(memberId: string) { return this.model(memberId).milestones; }
  public getInsights(memberId: string) { return this.model(memberId).insights; }
  public getRecommendation(memberId: string) { return this.model(memberId).recommendation; }
  public getCoaching(memberId: string) { return this.model(memberId).coaching; }
  public getReport(memberId: string) { return this.model(memberId).report; }
}