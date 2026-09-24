import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { readCorrectionAwareFormationProfile } from "../../functions/_shared/formation";
import { readCanonicalVisitorNarrative } from "./readCanonicalVisitorNarrative";
import type { CanonicalVisitorSummary } from "./canonicalVisitorContracts";

export async function readCanonicalVisitorSummary(
  visitorId: string
): Promise<CanonicalVisitorSummary> {
  const profilesTable = getFormationProfilesTableClient();

  const summary = await readCanonicalVisitorNarrative(
    visitorId,
    async (id) => readCorrectionAwareFormationProfile(profilesTable as any, id)
  );

  return {
    ok: true,
    v: 1,
    visitorId,
    summary
  };
}
