import { getVisitorById } from "../visitors/getVisitorById";
import { readCanonicalVisitorNarrative } from "../visitors/readCanonicalVisitorNarrative";
import { readCanonicalUnifiedVisitorStory } from "../narratives/readCanonicalUnifiedVisitorStory";
import { readCanonicalVisitorDashboardCard, type CanonicalVisitorDashboardCard } from "./readCanonicalVisitorDashboardCard";
import type { CanonicalVisitorNarrative, ReadFormationProfile } from "../narratives/canonicalNarrativeContracts";
import type { CanonicalUnifiedVisitorStory } from "../narratives/canonicalOperationalNarrativeContracts";

export type CanonicalVisitorSnapshotIdentity = {
  visitorId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type CanonicalVisitorSnapshot = {
  visitorId: string;
  identity: CanonicalVisitorSnapshotIdentity;
  dashboardCard: CanonicalVisitorDashboardCard;
  narrative: CanonicalVisitorNarrative;
  unifiedStory: CanonicalUnifiedVisitorStory;
};

function readVisitorIdentityField(visitor: any, field: string): string | null {
  const value = visitor?.[field];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0
    ? trimmed
    : null;
}

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
    identity: {
      visitorId,
      name: readVisitorIdentityField(visitor, "name"),
      email: readVisitorIdentityField(visitor, "email"),
      phone: readVisitorIdentityField(visitor, "phone")
    },
    dashboardCard,
    narrative,
    unifiedStory
  };
}
