import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { getVisitorsTableClient, VISITORS_PARTITION_KEY } from "../../storage/visitors/visitorsTable";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationEventsTableClient, getFormationProfilesTableClient } from "../../storage/formation/formationTables";

const EXPLICIT_FOLLOWUP_EVENT_TYPES = new Set([
  "FOLLOWUP_ASSIGNED",
  "PRAYER_REQUESTED",
  "INFO_REQUESTED"
]);

app.http("getFormationFollowupQueue", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/followup-queue",
  handler: async (
    req: HttpRequest,
    context: InvocationContext
  ): Promise<HttpResponseInit> => {

    const auth = requireApiKey(req);
    if (auth) return auth;

    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error("Missing STORAGE_CONNECTION_STRING");
    }

    const profilesTable = getFormationProfilesTableClient(connectionString);
    const eventsTable = getFormationEventsTableClient(connectionString);

    const windowHours = parsePositiveInt(req.query.get("windowHours"), 168);
    const maxResults = parsePositiveInt(req.query.get("maxResults"), 50);
    const cutoffMs = Date.now() - windowHours * 60 * 60 * 1000;


    await ensureTableExists(profilesTable);
    await ensureTableExists(eventsTable);

    const visitorsTable = getVisitorsTableClient();
    await ensureTableExists(visitorsTable);

    // Build visitorId -> identity map (staff usability)
    const visitorFilter = `PartitionKey eq '${VISITORS_PARTITION_KEY}'`;
    const visitorMap = new Map<string, any>();

    for await (const v of visitorsTable.listEntities({ queryOptions: { filter: visitorFilter } })) {
      const vid = (v as any).visitorId as string | undefined;
      if (!vid) continue;

      visitorMap.set(vid, {
        name: (v as any).name ?? "",
        email: (v as any).email ?? "",
        source: (v as any).source ?? "unknown",
        createdAt: (v as any).createdAt ?? null
      });
    }
const items: any[] = [];

    for await (const profile of profilesTable.listEntities()) {
      const visitorId = String((profile as any)?.visitorId ?? "");
      if (!visitorId) continue;

      let lastEvent: any | null = null;
      let explicitFollowup = false;

      for await (const evt of eventsTable.listEntities({
        queryOptions: {
          filter: `visitorId eq '${visitorId}'`
        }
      })) {
        if (
          !lastEvent ||
          new Date(((evt as any).occurredAt as string)).getTime() > new Date(((lastEvent as any).occurredAt as string)).getTime()
        ) {
          lastEvent = evt;
        }

        if (EXPLICIT_FOLLOWUP_EVENT_TYPES.has(String(((evt as any).type ?? (evt as any).eventType)))) {
          explicitFollowup = true;
        }
      }

      if (!lastEvent) continue;

      const lastEventTime = new Date(lastEvent.occurredAt).getTime();
      const isStale = lastEventTime < cutoffMs;

      if (!explicitFollowup && !isStale) continue;

      items.push({
        visitorId,
        visitor: visitorMap.get(visitorId) ?? null,
        formation: {
          stage: (profile as any)?.stage ?? null,
          lastEventAt: String(((lastEvent as any)?.occurredAt ?? "")),
          lastEventType: String((((lastEvent as any)?.eventType ?? (lastEvent as any)?.type) ?? ""))
        },
        followup: explicitFollowup
          ? {
              reasonCode: "EXPLICIT_FOLLOWUP",
              reasonLabel: "Follow-up explicitly requested",
              detail: `Event type: ${String((((lastEvent as any)?.eventType ?? (lastEvent as any)?.type) ?? ""))}`,
              priority: "high",
              suggestedAction: "Reach out personally to respond to the request."
            }
          : {
              reasonCode: "NO_RECENT_ACTIVITY",
              reasonLabel: `No formation activity in the last ${windowHours} hours`,
              detail: `Last event was ${Math.floor(
                (Date.now() - new Date(String(((lastEvent as any)?.occurredAt ?? ""))).getTime()) / (1000 * 60 * 60 * 24)
              )} days ago`,
              priority: "medium",
              suggestedAction: "Send a gentle check-in and invite them to the next step."
            }
      });}

    items.sort((a, b) => {
      if (a.followup.priority !== b.followup.priority) {
        return a.followup.priority === "high" ? -1 : 1;
      }
      return (
        new Date(a.formation.lastEventAt).getTime() -
        new Date(b.formation.lastEventAt).getTime()
      );
    });

    const trimmed = items.slice(0, maxResults);

    const itemsPreview = trimmed.map((it: any) => ({
  visitorId: it.visitorId,
  name: it.visitor?.name ?? "",
  email: it.visitor?.email ?? "",
  source: it.visitor?.source ?? "unknown",
  stage: it.formation?.stage ?? null,
  lastEventType: it.formation?.lastEventType ?? null,
  lastEventAt: it.formation?.lastEventAt ?? null,
  reasonCode: it.followup?.reasonCode ?? null,
  priority: it.followup?.priority ?? "normal",
  suggestedAction: it.followup?.suggestedAction ?? ""
}));

return {
  status: 200,
  jsonBody: {
    generatedAt: new Date().toISOString(),
    windowHours,
    maxResults,
    count: trimmed.length,
    items: trimmed,
    itemsPreview: trimmed.map((it: any) => ({
      visitorId: it.visitorId,
      name: it.visitor?.name ?? "",
      email: it.visitor?.email ?? "",
      source: it.visitor?.source ?? "unknown",
      createdAt: it.visitor?.createdAt ?? null,
      stage: it.formation?.stage ?? null,
      lastEventType: it.formation?.lastEventType ?? null,
      lastEventAt: it.formation?.lastEventAt ?? null,
      reasonCode: it.followup?.reasonCode ?? null,
      priority: it.followup?.priority ?? "normal",
      suggestedAction: it.followup?.suggestedAction ?? ""
    }))
  }
};}
});

function parsePositiveInt(val: string | null, fallback: number): number {
  if (!val) return fallback;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}




