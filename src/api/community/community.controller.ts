import { buildCommunityAlerts } from "../../domain/community/community.alerts";
import { buildCommunityAnalytics } from "../../domain/community/community.analytics";
import { getCommunityCoaching } from "../../domain/community/community.coaching";
import { buildCommunityInsights } from "../../domain/community/community.insights";
import { buildCommunityRecommendation } from "../../domain/community/community.intelligence";
import { buildCommunityMilestones } from "../../domain/community/community.milestones";
import { CommunityProfileIndex } from "../../domain/community/communityProfile.index";
import { createInitialCommunityProfile } from "../../domain/community/communityProfile.projection";
import { generateCommunityJourneyReport } from "../../domain/community/community.report";
import { buildCommunityTimeline } from "../../domain/community/community.timeline";
export class CommunityController {
  constructor(private readonly profiles: CommunityProfileIndex) {}
  private model(memberId: string) { const profile = this.profiles.getProfile(memberId) ?? createInitialCommunityProfile(memberId); const timeline = buildCommunityTimeline(profile, this.profiles.getEvents(memberId)); const milestones = buildCommunityMilestones(timeline); const insights = buildCommunityInsights(profile); const recommendation = buildCommunityRecommendation(profile, insights); const analytics = buildCommunityAnalytics(this.profiles.getAllProfiles()); const coaching = getCommunityCoaching(profile, milestones, insights, recommendation); return { profile, timeline, milestones, insights, recommendation, alerts: buildCommunityAlerts(profile, insights), analytics, coaching, report: generateCommunityJourneyReport({ profile, timeline, milestones, coaching, analytics }) }; }
  public getProfile(memberId: string) { return this.model(memberId).profile; } public getTimeline(memberId: string) { return this.model(memberId).timeline; } public getMilestones(memberId: string) { return this.model(memberId).milestones; } public getInsights(memberId: string) { return this.model(memberId).insights; } public getRecommendation(memberId: string) { return this.model(memberId).recommendation; } public getCoaching(memberId: string) { return this.model(memberId).coaching; } public getReport(memberId: string) { return this.model(memberId).report; }
}