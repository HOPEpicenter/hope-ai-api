import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";
import { readCanonicalVisitorNarrative } from "./readCanonicalVisitorNarrative";
import type { CanonicalVisitorNarrative } from "../narratives/canonicalNarrativeContracts";

export type CanonicalVisitorSummary = {
  ok: true;
  v: 1;
  visitorId: string;
  summary: CanonicalVisitorNarrative;
};

export async function readCanonicalVisitorSummary(
  visitorId: string
): Promise<CanonicalVisitorSummary> {
  const profilesTable = getFormationProfilesTableClient();

  const summary = await readCanonicalVisitorNarrative(
    visitorId,
    async (id) => getFormationProfile(profilesTable as any, id)
  );

  return {
    ok: true,
    v: 1,
    visitorId,
    summary
  };
}
