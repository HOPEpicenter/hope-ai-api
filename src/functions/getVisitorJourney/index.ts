import { TableClient } from "@azure/data-tables";
import { getConnString } from "../_shared/tableClient";

import { getVisitorById } from "../_shared/visitorsRepository";
import { getFormationProfileByVisitorId } from "../_shared/formation";
import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import { IntegrationService } from "../../services/integration/integrationService";
import { TIMELINE_DERIVATION_LIMIT } from "../../services/integration/timelineConstants";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";

const ENGAGEMENT_TABLE = process.env.ENGAGEMENT_EVENTS_TABLE || "devEngagementEvents";
const FORMATION_PROFILES_TABLE = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";

const integrationService = new IntegrationService(new EngagementEventsRepository());

function getEngagementTable(): TableClient {
  const conn = getConnString();
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING");
  return TableClient.fromConnectionString(conn, ENGAGEMENT_TABLE);
}

function getFormationProfilesTable(): TableClient {
  const conn = getConnString();
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING");
  return TableClient.fromConnectionString(conn, FORMATION_PROFILES_TABLE);
}

export async function getVisitorJourney(context: any, req: any): Promise<void> {
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

  const engagementTable = getEngagementTable();
  const formationProfilesTable = getFormationProfilesTable();

  // --- engagement events ---
  let engagementEvents: any[] = [];

  try {
    const timelinePage = await integrationService.readIntegratedTimeline(visitorId, TIMELINE_DERIVATION_LIMIT);
    engagementEvents = Array.isArray(timelinePage?.items) ? timelinePage.items : [];
  } catch {
    engagementEvents = [];
  }

  // --- formation profile ---
  const formationProfile = await getFormationProfileByVisitorId(
    formationProfilesTable,
    visitorId
  );

  const journey = deriveJourneySummaryV1({
    engagementEvents,
    formationProfile
  });

  context.res = {
    status: 200,
    body: {
      ok: true,
      visitorId,
      ...journey
    }
  };
}








