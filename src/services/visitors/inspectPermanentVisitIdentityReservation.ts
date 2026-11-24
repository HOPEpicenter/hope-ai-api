import type { TableClient } from "@azure/data-tables";
import { inspectPermanentVisitRecovery } from "./inspectPermanentVisitRecovery";

type ReadTable = Pick<TableClient, "listEntities">;
type Row = Record<string, unknown> & { partitionKey?: string; rowKey?: string };
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export type IdentityReservationInspection =
  | { status: "not_applicable" | "unavailable" }
  | { status: "ready"; stage: "no_reservation_observed" | "reservation_without_profile" |
      "created_profile_without_receipt" | "existing_profile_without_receipt";
      emailReservationObserved: boolean; phoneReservationObserved: boolean };

/** Internal read-only diagnostic. Observed index ownership does not prove the
 * original contact values, all expected indexes, or authorization to repair.
 * Never releases reservations or reconstructs visitor data. Not a snapshot.
 */
export async function inspectPermanentVisitIdentityReservation(
  submissionId: string, table: ReadTable
): Promise<IdentityReservationInspection> {
  const unavailable = { status: "unavailable" } as const;
  try {
    const state = await inspectPermanentVisitRecovery(submissionId, table);
    if (state.status === "unavailable") return unavailable;
    if (state.status !== "ready" || state.stage !== "adult_attendance_unconfirmed") {
      return { status: "not_applicable" };
    }
    async function exact(partition: string, key: string): Promise<Row | null> {
      if (!ID.test(key)) throw new Error("Invalid key");
      let result: Row | null = null;
      for await (const row of table.listEntities<Row>({ queryOptions: {
        filter: `PartitionKey eq '${partition}' and RowKey eq '${key}'`
      } })) {
        if (result || row.partitionKey !== partition || row.rowKey !== key) throw new Error("Invalid row");
        result = row;
      }
      return result;
    }
    const claim = await exact("VISITOR_CHECK_IN_CLAIM", submissionId);
    if (!claim || typeof claim.visitorId !== "string" || !ID.test(claim.visitorId) ||
        typeof claim.createProfile !== "boolean" || typeof claim.fingerprint !== "string" ||
        !/^[0-9a-f]{64}$/.test(claim.fingerprint) || typeof claim.claimedAt !== "string" ||
        !Number.isFinite(Date.parse(claim.claimedAt))) return unavailable;
    const id = claim.visitorId;
    const profile = await exact("VISITOR", id);
    if (profile && claim.createProfile && profile.checkInCreationId !== submissionId) return unavailable;
    if (!profile && !claim.createProfile) return unavailable;
    async function observed(partition: "EMAIL" | "PHONE"): Promise<boolean> {
      let found = false;
      for await (const row of table.listEntities<Row>({ queryOptions: {
        filter: `PartitionKey eq '${partition}' and visitorId eq '${id}'`,
        select: ["PartitionKey", "RowKey", "visitorId"]
      } })) {
        if (found || row.partitionKey !== partition || row.visitorId !== id ||
            typeof row.rowKey !== "string" || !row.rowKey) throw new Error("Ambiguous index evidence");
        found = true;
      }
      return found;
    }
    const emailReservationObserved = await observed("EMAIL");
    const phoneReservationObserved = await observed("PHONE");
    if (await exact("VISITOR_CHECK_IN", submissionId)) return unavailable;
    const stage = profile ? (claim.createProfile ? "created_profile_without_receipt" : "existing_profile_without_receipt") :
      (emailReservationObserved || phoneReservationObserved ? "reservation_without_profile" : "no_reservation_observed");
    return { status: "ready", stage, emailReservationObserved, phoneReservationObserved };
  } catch { return unavailable; }
}
