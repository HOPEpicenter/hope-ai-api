import { getVisitorById } from "../visitors/getVisitorById";
import { readCanonicalVisitorNarrative } from "../visitors/readCanonicalVisitorNarrative";
import { readCanonicalUnifiedVisitorStory } from "../narratives/readCanonicalUnifiedVisitorStory";
import { readCanonicalVisitorDashboardCard, type CanonicalVisitorDashboardCard } from "./readCanonicalVisitorDashboardCard";
import type { CanonicalVisitorNarrative, ReadFormationProfile } from "../narratives/canonicalNarrativeContracts";
import type { CanonicalUnifiedVisitorStory } from "../narratives/canonicalOperationalNarrativeContracts";
import { readCanonicalVisitorIdentity, type CanonicalVisitorIdentity } from "./visitorIdentity";

export type CanonicalVisitorSnapshotIdentity = CanonicalVisitorIdentity;

export type CanonicalVisitorSnapshot = {
  visitorId: string;
  identity: CanonicalVisitorSnapshotIdentity;
  dashboardCard: CanonicalVisitorDashboardCard;
  narrative: CanonicalVisitorNarrative;
  unifiedStory: CanonicalUnifiedVisitorStory;
};


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
