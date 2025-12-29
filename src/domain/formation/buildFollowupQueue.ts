import { TableClient } from "@azure/data-tables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { computeFromProfile } from "./computeFromProfile";

export type Urgency = "OVERDUE" | "DUE_SOON" | "WATCH";

export type FollowupQueueRow = {
  visitorId: string;
  stage: string;
  urgency: Urgency;
  assignedTo?: string | null;
  lastActivityAt?: string | null;
  daysSinceLastActivity?: number | null;
  lastFollowupAssignedAt?: string | null;
  lastFollowupOutcomeAt?: string | null;
  engaged?: boolean;
  lastEngagedAt?: string | null;
  daysSinceLastEngagement?: number | null;
  engagementCount?: number | null;
  engagementScore?: number | null;
  engagementScoreReasons?: string[];
  recommendedAction?: string;
  reason?: string;
};

export async function buildFollowupQueue(params: {
  profilesTable: TableClient;
  now: Date;
  limit: number;
}): Promise<FollowupQueueRow[]> {
  const { profilesTable, now, limit } = params;

  await ensureTableExists(profilesTable);

  const out: FollowupQueueRow[] = [];

  // keep consistent with existing storage partitioning
  const filter = "PartitionKey eq 'VISITOR'";

  for await (const p of profilesTable.listEntities({ queryOptions: { filter } })) {
    const computed: any = computeFromProfile(p as any, now);

    // Existing queue endpoint clearly outputs urgency top-level on the row.
    // We assume computeFromProfile produces a followup candidate object we can map,
    // OR it already returns row-like fields. We take the safe approach:
    const urgency: Urgency | undefined =
      computed?.urgency ?? computed?.followupUrgency ?? computed?.followup?.urgency ?? computed?.followup?.candidate?.urgency;

    if (urgency !== "OVERDUE" && urgency !== "DUE_SOON" && urgency !== "WATCH") continue;

    const row: FollowupQueueRow = {
      visitorId: (p as any).visitorId ?? (p as any).RowKey ?? "",
      stage: computed?.stage ?? (p as any).stage ?? "Unknown",
      urgency,
      assignedTo: computed?.assignedTo ?? computed?.followup?.assignedTo ?? (p as any).assignedTo ?? null,
      lastActivityAt: computed?.lastActivityAt ?? null,
      daysSinceLastActivity: computed?.daysSinceLastActivity ?? null,
      lastFollowupAssignedAt: computed?.lastFollowupAssignedAt ?? null,
      lastFollowupOutcomeAt: computed?.lastFollowupOutcomeAt ?? null,
      engaged: computed?.engaged ?? null,
      lastEngagedAt: computed?.lastEngagedAt ?? null,
      daysSinceLastEngagement: computed?.daysSinceLastEngagement ?? null,
      engagementCount: computed?.engagementCount ?? null,
      engagementScore: computed?.engagementScore ?? null,
      engagementScoreReasons: computed?.engagementScoreReasons ?? [],
      recommendedAction: computed?.recommendedAction ?? computed?.followup?.recommendedAction ?? "",
      reason: computed?.reason ?? computed?.followup?.reason ?? "",
    };

    out.push(row);
    if (out.length >= limit) break;
  }

  return out;
}
