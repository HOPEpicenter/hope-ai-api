import type { OverviewResponse } from "@/lib/contracts/overview";
import { getFollowups } from "@/lib/loaders/get-followups";
import { getVisitors } from "@/lib/loaders/get-visitors";

export async function getOverview(): Promise<OverviewResponse> {
  const [followups, visitors] = await Promise.all([
    getFollowups(),
    getVisitors()
  ]);

  const assignedNeedingAttention = followups.items.filter(
    (item) => !!item.assignedTo?.ownerId && item.needsFollowup
  );

  const waitingAssignment = visitors.items.filter(
    (visitor) => !followups.items.some((item) => item.visitorId === visitor.visitorId)
  );

  const contacted = visitors.items.filter((visitor) => {
    const followup = followups.items.find((item) => item.visitorId === visitor.visitorId);
    return !!followup?.lastFollowupContactedAt || !!followup?.lastFollowupOutcomeAt;
  });

  const jumpBackIn = assignedNeedingAttention.slice(0, 5).map((item) => ({
    title: item.visitorId,
    subtitle: `${item.assignedTo?.ownerId ?? "Unassigned"}${item.stage ? ` • ${item.stage}` : ""}`,
    href: `/visitors/${item.visitorId}?preset=needs-attention`
  }));

  return {
    ok: true,
    stats: [
      {
        label: "Waiting Assignment",
        value: waitingAssignment.length,
        helper: "Visitors with no active followup assignment"
      },
      {
        label: "Needs Attention",
        value: assignedNeedingAttention.length,
        helper: "Assigned followups still needing operator action"
      },
      {
        label: "Contacted",
        value: contacted.length,
        helper: "Visitors with contact recorded"
      },
      {
        label: "Visitors",
        value: visitors.items.length,
        helper: "Current visitor directory size"
      }
    ],
    recent: jumpBackIn
  };
}
