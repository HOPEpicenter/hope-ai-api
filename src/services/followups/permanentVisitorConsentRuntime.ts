import type { TableClient } from "@azure/data-tables";
import { createPermanentVisitorConsentRepository } from "../../repositories/permanentVisitorConsentRepository";
import { permitsContactWork } from "../../domain/followups/permanentVisitorConsentAuthority";
import { createPermanentVisitorRegistrationConsentAdapter, createPermanentVisitorPreAttendanceWithdrawal } from "./permanentVisitorRegistrationConsentAdapter";
import type { RecordedPublicVisitEvidence } from "./enrollRecordedPublicVisitor";

export type RegistrationConsentRecorder = ReturnType<typeof createPermanentVisitorRegistrationConsentAdapter>;
export type PreAttendanceWithdrawalRecorder = ReturnType<typeof createPermanentVisitorPreAttendanceWithdrawal>;
export type EnrollmentPermissionReader = (evidence: RecordedPublicVisitEvidence) => Promise<"granted" | "blocked" | "unavailable">;

/** Staged runtime composition only; callers must independently authorize
 * admission/reconciliation. No table provisioning or live activation here.
 * A public registration may start a plan only from its exact initial grant;
 * later permission changes belong to the authorized Staff workflow.
 */
export function createPermanentVisitorConsentRuntime(visitors: TableClient, consent: TableClient, initialGrantNotBefore: string) {
  if (typeof initialGrantNotBefore !== "string" || !Number.isFinite(Date.parse(initialGrantNotBefore)) ||
      new Date(initialGrantNotBefore).toISOString() !== initialGrantNotBefore) throw new Error("Consent cutover unavailable");
  const repository = createPermanentVisitorConsentRepository(consent);
  const recordConsent = createPermanentVisitorRegistrationConsentAdapter({ visitors, repository, initialGrantNotBefore });
  const recordPreAttendanceWithdrawal = createPermanentVisitorPreAttendanceWithdrawal({ visitors, repository, initialGrantNotBefore });
  const readEnrollmentPermission: EnrollmentPermissionReader = async evidence => {
    try {
      const operation = await repository.inspectOperation(evidence.visitorId, evidence.submissionId);
      if (operation.status !== "found") return "unavailable";
      const current = await repository.read(evidence.visitorId);
      if (current.status !== "ready" || operation.revision > current.state.revision) return "unavailable";
      const op = operation.operation;
      if (op.kind !== "new_profile" && op.kind !== "public_request") return "unavailable";
      if (!permitsContactWork(current.state)) return "blocked";
      return op.kind === "new_profile" && op.initialConsent === true ? "granted" : "blocked";
    } catch { return "unavailable"; }
  };
  return { recordConsent, readEnrollmentPermission, recordPreAttendanceWithdrawal };
}
