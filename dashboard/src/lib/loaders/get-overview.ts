import type { OverviewResponse } from "@/lib/contracts/overview";
import { getVisitors } from "@/lib/loaders/get-visitors";
import { getFormationProfiles } from "@/lib/loaders/get-formation-profiles";

export async function getOverview(): Promise<OverviewResponse> {
  const visitors = await getVisitors();

  const formationProfiles = await getFormationProfiles(
    visitors.items.map((v) => v.visitorId)
  );

  const profileByVisitorId = new Map(
    formationProfiles.items.map((p) => [p.visitorId, p] as const)
  );

  let waitingAssignment = 0;
  let needsAttention = 0;
  let contacted = 0;

  const recent: OverviewResponse["recent"] = [];

  for (const visitor of visitors.items) {
    const profile = profileByVisitorId.get(visitor.visitorId);

    const hasAssigned = !!profile?.assignedTo;
    const hasContacted = !!profile?.lastFollowupContactedAt;
    const hasOutcome = !!profile?.lastFollowupOutcomeAt;

    if (!hasAssigned) {
      waitingAssignment++;
      continue;
    }

    if (hasOutcome) {
      // resolved → not counted in overview buckets
      continue;
    }

    if (hasContacted) {
      contacted++;
      continue;
    }

    // assigned but not contacted/outcome
    needsAttention++;

    if (recent.length < 5) {
      recent.push({
        title: visitor.visitorId,
        subtitle: `${profile?.assignedTo ?? "Unassigned"}`,
        href: `/visitors/${visitor.visitorId}?preset=needs-attention`
      });
    }
  }

  return {
    ok: true,
    stats: [
      {
        label: "Waiting Assignment",
        value: waitingAssignment,
        helper: "Visitors with no active followup assignment"
      },
      {
        label: "Needs Attention",
        value: needsAttention,
        helper: "Assigned followups still needing operator action"
      },
      {
        label: "Contacted",
        value: contacted,
        helper: "Visitors with contact recorded"
      },
      {
        label: "Visitors",
        value: visitors.items.length,
        helper: "Current visitor directory size"
      }
    ],
    recent
  };
}

