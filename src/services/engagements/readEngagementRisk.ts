import { EngagementsService } from "./engagementsService";
import { computeEngagementScoreV1 } from "../../domain/engagement/computeEngagementScore.v1";
import { deriveEngagementRiskV1 } from "../../domain/engagement/deriveEngagementRisk.v1";

export async function readEngagementRiskV1(
  service: EngagementsService,
  visitorId: string,
  windowDays = 14
) {
  const MAX_EVENTS = 2000;
  const PAGE_SIZE = 250;

  const all: any[] = [];
  let cursor: string | undefined = undefined;

  while (all.length < MAX_EVENTS) {
    const page = await service.readTimeline(visitorId, PAGE_SIZE, cursor);
    all.push(...(page.items ?? []));

    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  const score = computeEngagementScoreV1({
    events: all as any,
    windowDays
  });

  return deriveEngagementRiskV1({
    visitorId,
    windowDays,
    engaged: score.engaged,
    lastEngagedAt: score.lastEngagedAt,
    daysSinceLastEngagement: score.daysSinceLastEngagement,
    engagementCount: score.engagementCount,
    score: score.score,
    scoreReasons: score.scoreReasons,
    needsFollowup: score.needsFollowup
  });
}
