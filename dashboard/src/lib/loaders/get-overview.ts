import type { OverviewResponse } from "@/lib/contracts/overview";
import { getFollowups } from "@/lib/loaders/get-followups";
import { getVisitors } from "@/lib/loaders/get-visitors";

export async function getOverview(): Promise<OverviewResponse> {
  const [followups, visitors] = await Promise.all([
    getFollowups(),
    getVisitors()
  ]);

  const activeFollowups = followups.items.length;
  const recentVisitors = visitors.items.length;

  return {
    ok: true,
    stats: [
      {
        label: "Open Followups",
        value: activeFollowups,
        helper: "Assigned items still needing attention"
      },
      {
        label: "Visitors",
        value: recentVisitors,
        helper: "Current visitor directory size"
      }
    ],
    recent: followups.items.slice(0, 5).map((item) => ({
      title: item.visitorId,
      subtitle: `${item.stage ?? "Unknown"}${item.needsFollowup ? " • Needs followup" : ""}`,
      href: `/visitors/${item.visitorId}`
    }))
  };
}
