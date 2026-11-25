import type { TableClient } from "@azure/data-tables";
import type { SixWeekFollowupEventsRepository } from "../../repositories/sixWeekFollowupEventsRepository";
import { enrollRecordedPublicVisitor } from "../followups/enrollRecordedPublicVisitor";
import { inspectPermanentVisitRecovery } from "./inspectPermanentVisitRecovery";
import { createPermanentVisitRecoveryJournal, type PermanentVisitRecoveryIntent } from "./permanentVisitRecoveryJournal";

type Result = "disabled" | "requires_review" | "unavailable" | "completed" | "already_completed";
type Dependencies = {
  enabled?: boolean;
  visitors?: TableClient;
  recordConsent?: import("../followups/permanentVisitorConsentRuntime").RegistrationConsentRecorder;
  appendAuthorizedEnrollment?: NonNullable<
    Parameters<typeof enrollRecordedPublicVisitor>[1]
  >["appendAuthorizedEnrollment"];
  readEnrollmentPermission?: import("../followups/permanentVisitorConsentRuntime").EnrollmentPermissionReader;
  repository?: Pick<SixWeekFollowupEventsRepository, "append" | "listByVisitor">;
};

/** Trusted internal operation only. No public or Staff HTTP authority is implied.
 * Requires independently verified complete attendance. Only the existing
 * consent-aware enrollment boundary and create-only completion journal may write.
 * Never creates profiles or attendance, releases indexes, or sends communications.
 */
export async function reconcilePermanentVisitCompletion(
  submissionId: string, deps: Dependencies = {}
): Promise<Result> {
  if (deps.enabled !== true) return "disabled";
  if (!deps.visitors || !deps.repository ||
      Boolean(deps.recordConsent) !== Boolean(deps.readEnrollmentPermission)) return "unavailable";
  const table = deps.visitors;
  try {
    const state = await inspectPermanentVisitRecovery(submissionId, table);
    if (state.status === "unavailable") return "unavailable";
    if (state.status !== "ready") return "requires_review";
    if (state.stage === "completed" && !deps.recordConsent) return "already_completed";
    // In authority mode an incomplete family must not prevent processing
    // the independently verified adult receipt. Never complete its journal.
    if (!state.adultRecorded || !state.followupExpected) return "requires_review";
    if (!deps.recordConsent && (state.stage !== "completion_unconfirmed" ||
        state.familyExpected !== state.familyRecorded)) return "requires_review";
    const intent: PermanentVisitRecoveryIntent = {
      submissionId: state.submissionId, serviceId: state.serviceId, visitDate: state.visitDate,
      familyExpected: state.familyExpected, followupExpected: state.followupExpected
    };
    const journal = createPermanentVisitRecoveryJournal(table);
    // Identity must come from the exact persisted receipt, never the caller.
    const receipt = await table.getEntity<{ visitorId: string; serviceId: string }>("VISITOR_CHECK_IN", submissionId);
    if (receipt.partitionKey !== "VISITOR_CHECK_IN" || receipt.rowKey !== submissionId ||
        receipt.serviceId !== intent.serviceId || typeof receipt.visitorId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(receipt.visitorId)) return "unavailable";
    const claim = await table.getEntity<{ visitorId: string }>("VISITOR_CHECK_IN_CLAIM", submissionId);
    if (claim.partitionKey !== "VISITOR_CHECK_IN_CLAIM" || claim.rowKey !== submissionId ||
        claim.visitorId !== receipt.visitorId) return "unavailable";
    if (state.stage === "completed") {
      // Historical completion must not silently bootstrap authority.
      const permission = await deps.readEnrollmentPermission!({
        visitorId: receipt.visitorId, submissionId, serviceId: intent.serviceId, visitDate: intent.visitDate
      });
      return permission === "unavailable" ? "requires_review" : "already_completed";
    }
    if (deps.recordConsent) {
      const consent = await deps.recordConsent({
        visitorId: receipt.visitorId, submissionId, serviceId: intent.serviceId
      });
      if (consent.status !== "recorded") return "unavailable";
    }
    if (state.stage !== "completion_unconfirmed" ||
        state.familyExpected !== state.familyRecorded) return "requires_review";
    const result = await enrollRecordedPublicVisitor({
      visitorId: receipt.visitorId, submissionId, serviceId: intent.serviceId, visitDate: intent.visitDate
    }, { enabled: true, visitors: table, repository: deps.repository,
      readEnrollmentPermission: deps.readEnrollmentPermission,
      appendAuthorizedEnrollment: deps.appendAuthorizedEnrollment });
    if (result !== "enrolled" && result !== "existing" && result !== "not_eligible") return "unavailable";
    // Recheck canonical attendance before claiming pipeline completion.
    const after = await inspectPermanentVisitRecovery(submissionId, table);
    if (after.status !== "ready" || !after.adultRecorded || after.familyRecorded !== intent.familyExpected ||
        after.submissionId !== intent.submissionId || after.serviceId !== intent.serviceId ||
        after.visitDate !== intent.visitDate || after.familyExpected !== intent.familyExpected ||
        after.followupExpected !== intent.followupExpected ||
        (after.stage !== "completed" && after.stage !== "completion_unconfirmed")) return "unavailable";
    if (after.stage === "completed") return "already_completed";
    return await journal.complete(intent) ? "completed" : "unavailable";
  } catch { return "unavailable"; }
}
