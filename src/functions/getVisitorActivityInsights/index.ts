import { requireApiKeyForFunction } from "../_shared/apiKey";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { TIMELINE_DERIVATION_LIMIT } from "../../services/integration/timelineConstants";

const integrationService = new IntegrationService(new EngagementEventsRepository());

function clampWindowDays(value: unknown): number {
  const n = Number(value ?? 7);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(90, Math.floor(n)));
}

function isWithinWindow(occurredAt: unknown, windowDays: number): boolean {
  const ms = Date.parse(String(occurredAt ?? ""));
  if (!Number.isFinite(ms)) return false;

  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  return ms >= cutoff;
}

function isMeaningfulActivity(item: any): boolean {
  const activityType = String(item?.activityType ?? "").trim();

  return [
    "CONTACT_MADE",
    "FOLLOWUP_COMPLETED",
    "FOLLOWUP_ASSIGNED",
    "FOLLOWUP_UNASSIGNED",
    "VISITOR_ENGAGED",
    "VISITOR_DISENGAGED",
    "NEXT_STEP_SELECTED"
  ].includes(activityType);
}

function summarizeActivity(items: any[], windowDays: number) {
  const windowItems = items.filter((item) => isWithinWindow(item?.occurredAt, windowDays));

  const counts = {
    contacts: 0,
    followupsCompleted: 0,
    followupsAssigned: 0,
    followupsUnassigned: 0,
    engagementChanges: 0,
    formationActions: 0
  };

  for (const item of windowItems) {
    const activityType = String(item?.activityType ?? "").trim();
    const category = String(item?.activityCategory ?? "").trim();

    if (activityType === "CONTACT_MADE") counts.contacts++;
    if (activityType === "FOLLOWUP_COMPLETED") counts.followupsCompleted++;
    if (activityType === "FOLLOWUP_ASSIGNED") counts.followupsAssigned++;
    if (activityType === "FOLLOWUP_UNASSIGNED") counts.followupsUnassigned++;
    if (category === "ENGAGEMENT") counts.engagementChanges++;
    if (category === "FORMATION") counts.formationActions++;
  }

  const latestMeaningful = items.find(isMeaningfulActivity) ?? null;

  return {
    windowDays,
    ...counts,
    totalWindowActivities: windowItems.length,
    lastMeaningfulActivity: latestMeaningful
      ? {
          activityType: latestMeaningful.activityType ?? null,
          activityCategory: latestMeaningful.activityCategory ?? null,
          summary: latestMeaningful.summary ?? null,
          occurredAt: latestMeaningful.occurredAt ?? null,
          eventId: latestMeaningful.eventId ?? null,
          stream: latestMeaningful.stream ?? null
        }
      : null
  };
}

export async function getVisitorActivityInsights(context: any, req: any): Promise<void> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
      return;
    }

    const visitorId = String(req?.params?.id ?? "").trim();

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const windowDays = clampWindowDays(req?.query?.windowDays);
    const page = await integrationService.readIntegratedTimeline(
      visitorId,
      Math.max(TIMELINE_DERIVATION_LIMIT, 100)
    );

    const items = Array.isArray(page?.items) ? page.items : [];
    const insights = summarizeActivity(items, windowDays);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitorId,
        insights
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: "internal error" }
    };
  }
}
