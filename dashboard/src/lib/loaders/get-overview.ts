import type { OverviewResponse } from "@/lib/contracts/overview";
import { getGlobalActivity } from "./get-global-activity";

export async function getOverview(): Promise<OverviewResponse> {
  try {
    const activity = await getGlobalActivity(20);

    const engagementCount = activity.items.filter((item) => item.stream === "engagement").length;
    const formationCount = activity.items.filter((item) => item.stream === "formation").length;
    const distinctVisitors = new Set(
      activity.items
        .map((item) => item.visitorId)
        .filter((value) => typeof value === "string" && value.trim().length > 0)
    ).size;

    return {
      ok: true,
      stats: [
        {
          label: "Recent Activity",
          value: activity.items.length,
          helper: "Latest integrated events"
        },
        {
          label: "Engagement Events",
          value: engagementCount,
          helper: "Recent engagement signals"
        },
        {
          label: "Formation Events",
          value: formationCount,
          helper: "Recent formation movement"
        },
        {
          label: "Visitors Touched",
          value: distinctVisitors,
          helper: "Visitors in recent activity"
        }
      ],
      recent: activity.items.slice(0, 5).map((item) => ({
        title: item.summary,
        subtitle: `${item.stream} • visitor ${item.visitorId}`,
        timestamp: item.occurredAt,
        href: `/visitors/${encodeURIComponent(item.visitorId)}`
      }))
    };
  } catch {
    return {
      ok: false,
      stats: [
        {
          label: "Recent Activity",
          value: 0,
          helper: "Latest integrated events"
        },
        {
          label: "Engagement Events",
          value: 0,
          helper: "Recent engagement signals"
        },
        {
          label: "Formation Events",
          value: 0,
          helper: "Recent formation movement"
        },
        {
          label: "Visitors Touched",
          value: 0,
          helper: "Visitors in recent activity"
        }
      ],
      recent: []
    };
  }
}
