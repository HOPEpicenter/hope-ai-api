import { getTableClient as getHopeTableClient } from "../_shared/tableClient";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import { TableClient } from "@azure/data-tables";
import { getConnString } from "../_shared/tableClient";

import { getVisitorById } from "../_shared/visitorsRepository";
import { readCorrectionAwareFormationProfile } from "../_shared/formation";
import { readCanonicalJourneyNarrative } from "../../services/journey/readCanonicalJourneyNarrative";

const ENGAGEMENT_TABLE = process.env.ENGAGEMENT_EVENTS_TABLE || "devEngagementEvents";
const FORMATION_PROFILES_TABLE = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";

function getEngagementTable(): TableClient {
  return getHopeTableClient(ENGAGEMENT_TABLE);
}

function getFormationProfilesTable(): TableClient {
  return getHopeTableClient(FORMATION_PROFILES_TABLE);
}

export async function getVisitorJourney(context: any, req: any): Promise<void> {
  const auth = requireApiKeyForFunction(req);

  if (!auth.ok) {
    context.res = {
      status: auth.status,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: auth.body
    };
    return;
  }

  const visitorId = context.bindingData?.visitorId;

  if (!visitorId) {
    context.res = { status: 400, body: { ok: false, error: "visitorId required" } };
    return;
  }

  const visitor = await getVisitorById(visitorId);

  if (!visitor) {
    context.res = { status: 404, body: { ok: false, error: "not found" } };
    return;
  }

  const formationProfilesTable = getFormationProfilesTable();

  const journey = await readCanonicalJourneyNarrative(
    visitorId,
    async (id) => readCorrectionAwareFormationProfile(formationProfilesTable, id)
  );

  context.res = {
    status: 200,
    body: {
      ok: true,
      visitorId,
      ...journey
    }
  };
}







