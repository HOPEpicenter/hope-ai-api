import { TableClient } from "@azure/data-tables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { computeFromProfile } from "../formation/computeFromProfile";

export type Urgency = "OVERDUE" | "DUE_SOON" | "WATCH";

export async function computeUrgencyNow(params: {
  profilesTable: TableClient;
  now: Date;
  maxScan?: number;
}): Promise<{ openNow: number; urgencyNow: Record<Urgency, number>; scanned: number }> {
  const { profilesTable, now, maxScan = 5000 } = params;

  await ensureTableExists(profilesTable);

  const urgencyNow: Record<Urgency, number> = { OVERDUE: 0, DUE_SOON: 0, WATCH: 0 };

  let scanned = 0;
  let openNow = 0;

  // Assumes VISITOR partition key pattern used across formation profiles.
  const filter = "PartitionKey eq 'VISITOR'";

  for await (const p of profilesTable.listEntities({ queryOptions: { filter } })) {
    scanned++;
    if (scanned > maxScan) break;

    // computeFromProfile is the single brain
    const computed = computeFromProfile(p as any, now);

    // We count "open" as: currently needs follow-up and has urgency
    const u = (computed as any).followup?.urgency as Urgency | undefined;

    if (u === "OVERDUE" || u === "DUE_SOON" || u === "WATCH") {
      openNow++;
      urgencyNow[u]++;
    }
  }

  return { openNow, urgencyNow, scanned };
}
