import { buildGivingAlerts } from "../../domain/giving/giving.alerts";
import { buildGivingAnalytics } from "../../domain/giving/giving.analytics";
import { getGivingCoaching } from "../../domain/giving/giving.coaching";
import { buildGivingInsights } from "../../domain/giving/giving.insights";
import { buildGivingRecommendation } from "../../domain/giving/giving.intelligence";
import { buildGivingMilestones } from "../../domain/giving/giving.milestones";
import { GivingProfileIndex } from "../../domain/giving/givingProfile.index";
import { createInitialGivingProfile } from "../../domain/giving/givingProfile.projection";
import { generateGivingJourneyReport } from "../../domain/giving/giving.report";
import { buildGivingTimeline } from "../../domain/giving/giving.timeline";
export class GivingController {
  constructor(private readonly profiles: GivingProfileIndex) {}
  private model(memberId: string) { const profile = this.profiles.getProfile(memberId) ?? createInitialGivingProfile(memberId); const timeline = buildGivingTimeline(profile, this.profiles.getEvents(memberId)); const milestones = buildGivingMilestones(timeline); const insights = buildGivingInsights(profile); const recommendation = buildGivingRecommendation(profile, insights); const analytics = buildGivingAnalytics(this.profiles.getAllProfiles()); const coaching = getGivingCoaching(profile, milestones, insights, recommendation); return { profile, timeline, milestones, insights, recommendation, alerts: buildGivingAlerts(profile, insights), analytics, coaching, report: generateGivingJourneyReport({ profile, timeline, milestones, coaching, analytics }) }; }
  public getProfile(memberId: string) { return this.model(memberId).profile; } public getTimeline(memberId: string) { return this.model(memberId).timeline; } public getMilestones(memberId: string) { return this.model(memberId).milestones; } public getInsights(memberId: string) { return this.model(memberId).insights; } public getRecommendation(memberId: string) { return this.model(memberId).recommendation; } public getCoaching(memberId: string) { return this.model(memberId).coaching; } public getReport(memberId: string) { return this.model(memberId).report; }
}