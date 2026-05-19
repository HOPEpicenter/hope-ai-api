import { getVisitorById } from "../visitors/getVisitorById";
import { readCanonicalVisitorNarrative } from "../visitors/readCanonicalVisitorNarrative";
import { readCanonicalUnifiedVisitorStory } from "../narratives/readCanonicalUnifiedVisitorStory";
import { readCanonicalVisitorDashboardCard } from "./readCanonicalVisitorDashboardCard";
import type { ReadFormationProfile } from "../narratives/canonicalNarrativeContracts";
import type { CanonicalVisitorSnapshot } from "./canonicalDashboardContracts";
import { readCanonicalVisitorIdentity } from "./visitorIdentity";


export async function readCanonicalVisitorSnapshot(
  visitorId: string,
  readFormationProfile: ReadFormationProfile
): Promise<CanonicalVisitorSnapshot> {
  const [
    visitor,
    narrative,
    dashboardCard
  ] = await Promise.all([
    getVisitorById(visitorId),
    readCanonicalVisitorNarrative(visitorId, readFormationProfile),
    readCanonicalVisitorDashboardCard(visitorId)
  ]);

  const unifiedStory = await readCanonicalUnifiedVisitorStory({
    visitor: narrative,
    followups: null
  });

  return {
    visitorId,
    identity: readCanonicalVisitorIdentity(visitorId, visitor),
    dashboardCard,
    narrative,
    unifiedStory
  };
}
