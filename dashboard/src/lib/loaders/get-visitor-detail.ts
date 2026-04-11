import type { VisitorDetailResponse } from "@/lib/contracts/visitor-detail";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function getJson(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }

  return response.json();
}

export async function getVisitorDetail(visitorId: string): Promise<VisitorDetailResponse> {
  const baseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("HOPE_API_KEY");

  const [visitorData, eventsData, summaryData, dashboardCardData] = await Promise.all([
    getJson(`${baseUrl}/api/visitors/${encodeURIComponent(visitorId)}`, apiKey),
    getJson(`${baseUrl}/api/visitors/${encodeURIComponent(visitorId)}/formation/events`, apiKey),
    getJson(`${baseUrl}/api/visitors/${encodeURIComponent(visitorId)}/summary`, apiKey),
    getJson(`${baseUrl}/ops/visitors/${encodeURIComponent(visitorId)}/dashboard-card`, apiKey)
  ]);

  const visitor = visitorData?.visitor ?? visitorData;
  const events = Array.isArray(eventsData?.items)
    ? eventsData.items
    : Array.isArray(eventsData?.events)
      ? eventsData.events
      : Array.isArray(eventsData)
        ? eventsData
        : [];

  return {
    journey: summaryData?.summary?.journey ?? null,
    engagementTimeline: summaryData?.summary?.engagement?.timelinePreview ?? [],
    dashboardCard: dashboardCardData?.card ?? null,

    ok: true,
    visitor: {
      visitorId: String(visitor?.visitorId ?? visitor?.id ?? visitorId),
      name: String(visitor?.name ?? ""),
      email: visitor?.email ?? null,
      createdAt: String(visitor?.createdAt ?? ""),
      updatedAt: String(visitor?.updatedAt ?? visitor?.createdAt ?? "")
    },
    formationProfile: summaryData?.summary?.formation?.profile ?? null,
    formationMilestones: {
      hasSalvation: summaryData?.summary?.formation?.milestones?.hasSalvation ?? false,
      hasBaptism: summaryData?.summary?.formation?.milestones?.hasBaptism ?? false,
      hasMembership: summaryData?.summary?.formation?.milestones?.hasMembership ?? false
    },
    formationEvents: events
      .map((event: {
        eventId?: string | null;
        id?: string | null;
        eventType?: string | null;
        type?: string | null;
        happenedAt?: string | null;
        occurredAt?: string | null;
        recordedAt?: string | null;
        createdAt?: string | null;
        timestamp?: string | null;
        source?: string | null;
        notes?: string | null;
        note?: string | null;
        data?: {
          notes?: string | null;
          note?: string | null;
        } | null;
      }, index: number) => ({
        eventId: String(event?.eventId ?? event?.id ?? `${visitorId}-${index}`),
        eventType: String(event?.eventType ?? event?.type ?? "UNKNOWN"),
        happenedAt:
          event?.happenedAt ??
          event?.occurredAt ??
          event?.recordedAt ??
          event?.createdAt ??
          event?.timestamp ??
          null,
        source: event?.source ?? null,
        notes:
          event?.notes ??
          event?.note ??
          event?.data?.notes ??
          event?.data?.note ??
          null
      }))
      .sort((a: { happenedAt: string | null }, b: { happenedAt: string | null }) => {
        const aTime = a.happenedAt ? new Date(a.happenedAt).getTime() : 0;
        const bTime = b.happenedAt ? new Date(b.happenedAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 8)
  };
}
