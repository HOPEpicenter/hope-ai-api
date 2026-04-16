import { getGlobalActivity } from "./get-global-activity";

export type OverviewRecentItem = {
  visitorId: string;
  summary: string;
  occurredAt: string | null;
  stream: "engagement" | "formation";
};

export type OverviewResponse = {
  recent: OverviewRecentItem[];
};

export async function getOverview(): Promise<OverviewResponse> {
  try {
    const activity = await getGlobalActivity(5);

    const recent: OverviewRecentItem[] = activity.items.map((item) => ({
      visitorId: item.visitorId,
      summary: item.summary,
      occurredAt: item.occurredAt,
      stream: item.stream
    }));

    return {
      recent
    };
  } catch (err) {
    return {
      recent: []
    };
  }
}
