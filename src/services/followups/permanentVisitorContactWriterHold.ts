import type { createPermanentVisitorConsentRepository } from "../../repositories/permanentVisitorConsentRepository";

// The authority rollout is NOT a cross-table execution credential. Until
// canonical writers are migrated, authority mode holds new contact work.
// There is deliberately no second environment switch that releases this hold.
export const CONTACT_WRITER_HOLD_MESSAGE = "Contact writer reconciliation required";
export function contactWriterHoldEnabled(): boolean {
  return process.env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY === "true";
}

export type ContactWriterScope = "six_week" | "ministry_communication" | "care";
export function contactMutationHeld(scope: ContactWriterScope, type: string, data: unknown): boolean {
  if (!contactWriterHoldEnabled()) return false;
  const d = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown> : {};
  if (scope === "six_week") {
    // These operations reduce work or record an already established historical
    // closure. The existing service must still authorize and validate them.
    if (type === "six_week_followup.plan_cancelled" || type === "six_week_followup.plan_paused") return false;
    if (type === "six_week_followup.owner_assigned" && d.ownerStaffId === null) return false;
    if (type === "six_week_followup.task_care_outcome_recorded" && d.weekNumber === 6 &&
        (d.careOutcome === "closed" || d.careOutcome === "connected")) return false;
    return true;
  }
  if (scope === "ministry_communication") {
    if (type === "ministry_communication.cancelled" || type === "ministry_communication.outcome_recorded") return false;
    if (type === "ministry_communication.preference_recorded" && (d.state === "denied" || d.state === "unknown")) return false;
    return true;
  }
  const name = type.trim().toUpperCase();
  const outcome = String(d.outcome ?? "").trim().toLowerCase();
  const next = String(d.nextAction ?? "").trim().toLowerCase();
  if (name === "FOLLOWUP_OUTCOME_RECORDED") return !((outcome === "connected" || outcome === "closed") && (next === "" || next === "none"));
  return name === "FOLLOWUP_ASSIGNED" || name === "FOLLOWUP_CONTACTED" || name === "NEXT_STEP_SELECTED";
}

export function assertContactWriterNotHeld(scope: ContactWriterScope, type: string, data: unknown): void {
  if (contactMutationHeld(scope, type, data)) {
    throw Object.assign(new Error(CONTACT_WRITER_HOLD_MESSAGE), { statusCode: 503 });
  }
}

// Read-only reconciliation of an exact existing intent, not a writer or lease.
// Neither a current nor stale intent authorizes cross-store execution.
// No automatic retry, rebase, cancellation or mutation is performed.
export async function assessHeldContactIntent(
  repository: Pick<ReturnType<typeof createPermanentVisitorConsentRepository>, "inspectContactIntent">,
  visitorId: string, intent: unknown
): Promise<{ status: "disabled" | "held" | "stale" | "conflict" | "not_found" | "unavailable"; executionPermitted: false }> {
  const result = (status: "disabled" | "held" | "stale" | "conflict" | "not_found" | "unavailable") =>
    ({ status, executionPermitted: false as const });
  if (!contactWriterHoldEnabled()) return result("disabled");
  try {
    const inspected = await repository.inspectContactIntent(visitorId, intent);
    switch (inspected.status) {
      case "current": return result("held");
      case "stale": return result("stale");
      case "conflict": return result("conflict");
      case "not_found": return result("not_found");
      default: return result("unavailable");
    }
  } catch { return result("unavailable"); }
}
