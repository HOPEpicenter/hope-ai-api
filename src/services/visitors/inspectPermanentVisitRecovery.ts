import { createHash } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { createPermanentVisitRecoveryJournal } from "./permanentVisitRecoveryJournal";
import { readFamily } from "./readCanonicalVisitorRegistrationFamilyHistory";
import { isVisitorCheckInRequest } from "./recordVisitorCheckIn";

type ReadTable = Pick<TableClient, "listEntities">;
type ReadRow = Record<string, unknown> & { partitionKey?: string; rowKey?: string };
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[0-9a-f]{64}$/;
export type PermanentVisitRecoveryInspection =
  | { status: "not_tracked" | "unavailable" }
  | { status: "ready"; submissionId: string; serviceId: string; visitDate: string;
      stage: "awaiting_arrival_claim" | "adult_attendance_unconfirmed" |
        "family_attendance_unconfirmed" | "completion_unconfirmed" | "completed";
      familyExpected: boolean; followupExpected: boolean;
      adultRecorded: boolean; familyRecorded: boolean };

function iso(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

/** Internal read-only evidence inspection. Not an admission or repair authority.
 * Requires authorized staff boundary before exposure. No names, contacts,
 * child details, hashes, credentials or raw storage rows leave this service.
 */
export async function inspectPermanentVisitRecovery(
  submissionId: string, table: ReadTable
): Promise<PermanentVisitRecoveryInspection> {
  const unavailable = { status: "unavailable" } as const;
  if (!isVisitorCheckInRequest(submissionId, "recovery")) return unavailable;
  try {
    // Only the read capability is present. The journal's write methods are
    // deliberately unusable in this adapter.
    const journal = createPermanentVisitRecoveryJournal({
      listEntities: table.listEntities.bind(table),
      createEntity: async () => { throw new Error("Read only"); }
    });
    const state = await journal.inspect(submissionId);
    if (state.status === "not_tracked" || state.status === "unavailable") return { status: state.status };
    if (!("intent" in state)) return unavailable;
    const intent = state.intent;
    const ready = (stage: Extract<PermanentVisitRecoveryInspection, { status: "ready" }>["stage"],
      adultRecorded = false, familyRecorded = false): PermanentVisitRecoveryInspection => ({
      status: "ready", submissionId, serviceId: intent.serviceId, visitDate: intent.visitDate,
      familyExpected: intent.familyExpected, followupExpected: intent.followupExpected,
      stage, adultRecorded, familyRecorded
    });
    async function read(partition: string, key: string): Promise<ReadRow | null> {
      if (!ID.test(key)) throw new Error("Invalid key");
      let row: ReadRow | null = null;
      for await (const item of table.listEntities<ReadRow>({ queryOptions: {
        filter: `PartitionKey eq '${partition}' and RowKey eq '${key}'`
      } })) {
        if (row || item.partitionKey !== partition || item.rowKey !== key) throw new Error("Invalid row evidence");
        row = item;
      }
      return row;
    }
    const claim = await read("VISITOR_CHECK_IN_CLAIM", submissionId);
    const receipt = await read("VISITOR_CHECK_IN", submissionId);
    if (!claim) return receipt || state.status === "completed" ? unavailable : ready("awaiting_arrival_claim");
    if (typeof claim.visitorId !== "string" || !ID.test(claim.visitorId) ||
        typeof claim.fingerprint !== "string" || !HASH.test(claim.fingerprint) ||
        typeof claim.createProfile !== "boolean" || !iso(claim.claimedAt)) return unavailable;
    if (!receipt) return state.status === "completed" ? unavailable : ready("adult_attendance_unconfirmed");
    if (receipt.visitorId !== claim.visitorId || receipt.serviceId !== intent.serviceId ||
        !iso(receipt.recordedAt) || typeof receipt.registrationDetailsJson !== "string" ||
        Buffer.byteLength(receipt.registrationDetailsJson, "utf8") > 8192) return unavailable;
    const details = JSON.parse(receipt.registrationDetailsJson);
    if (!details || typeof details !== "object" || Array.isArray(details) ||
        details.version !== 1 || typeof details.name !== "string" || !details.name ||
        !(details.email === null || typeof details.email === "string") ||
        !(details.phone === null || typeof details.phone === "string") ||
        (!details.email && !details.phone) || typeof details.contactConsent !== "boolean") return unavailable;
    const fingerprint = createHash("sha256").update(JSON.stringify([
      "complete-public-visitor-arrival-v1", intent.serviceId, details.name.toLowerCase(),
      details.email ?? "", details.phone ?? "", receipt.registrationDetailsJson
    ])).digest("hex");
    if (fingerprint !== claim.fingerprint) return unavailable;
    if (!await read("VISITOR", claim.visitorId)) return unavailable;
    const family = await readFamily(table, claim.visitorId, { submissionId, serviceId: intent.serviceId });
    const familyRecorded = family.status === "recorded";
    if (!intent.familyExpected && familyRecorded) return unavailable;
    if (intent.familyExpected && !familyRecorded) return state.status === "completed" ? unavailable : ready("family_attendance_unconfirmed", true);
    // A matching completion journal records the pipeline's prior completion;
    // it is not a claim about current consent or current follow-up state.
    return ready(state.status === "completed" ? "completed" : "completion_unconfirmed", true, familyRecorded);
  } catch { return unavailable; }
}
