import {
  requireCurrentRegistrationContactPermission,
  type RegistrationConsentReader,
  type RegistrationContactFailure
} from "./requireCurrentRegistrationContactPermission";

/** Classify new staff contact work at the HTTP boundary, not during replay. */
export async function requireRegistrationEventContactPermission(
  visitorId: unknown,
  eventType: unknown,
  eventData: unknown,
  readConsent?: RegistrationConsentReader
): Promise<RegistrationContactFailure | null> {
  const type = String(eventType ?? "").trim();
  const data = eventData && typeof eventData === "object" && !Array.isArray(eventData)
    ? eventData as Record<string, unknown> : {};
  const outcome = String(data.outcome ?? "").trim().toLowerCase();
  const nextAction = String(data.nextAction ?? "").trim().toLowerCase();
  const isClosure = (outcome === "connected" || outcome === "closed") &&
    (nextAction === "" || nextAction === "none");
  const needsPermission = type === "FOLLOWUP_ASSIGNED" ||
    type === "FOLLOWUP_CONTACTED" || type === "NEXT_STEP_SELECTED" ||
    (type === "FOLLOWUP_OUTCOME_RECORDED" && !isClosure);
  if (!needsPermission) return null;
  const id = typeof visitorId === "string" ? visitorId.trim() : "";
  return requireCurrentRegistrationContactPermission(id, readConsent);
}
