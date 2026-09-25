import { MemberJourneyService } from "../../domain/memberJourney/memberJourney.service";

export class MemberJourneyController {
  constructor(private readonly service = new MemberJourneyService()) {}

  getReport(memberId: string) { return this.service.build({ memberId }); }
  getJourney(memberId: string) { return this.getReport(memberId); }
  getSummary(memberId: string) { const report = this.getReport(memberId); return { memberId: report.memberId, narrative: report.narrative, keyMoments: report.keyMoments, turningPoints: report.turningPoints }; }
  getInsights(memberId: string) { return this.getReport(memberId).insights; }
  getRecommendations(memberId: string) { return this.getReport(memberId).recommendations; }
}