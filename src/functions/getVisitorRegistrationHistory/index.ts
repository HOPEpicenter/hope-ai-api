import { requireApiKeyForFunction } from "../_shared/apiKey";
import { readHighRiskStaffVisibility } from "../_shared/highRiskStaffActor";
import { readCanonicalVisitorRegistrationFamilyHistory } from "../../services/visitors/readCanonicalVisitorRegistrationFamilyHistory";
import { readLatestRegistrationConsent } from "../../services/followups/readLatestRegistrationConsent";

type Dependencies = {
  readStaff?: Parameters<typeof readHighRiskStaffVisibility>[1];
  readHistory?: typeof readCanonicalVisitorRegistrationFamilyHistory;
  readConsent?: typeof readLatestRegistrationConsent;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Staff-only read. Never accepts public visitor bridge credentials as authority.
 * The trusted dashboard supplies the canonical actor header with its server key.
 * Child names/age groups use the existing pastoral visibility boundary.
 */
export async function getVisitorRegistrationHistory(
  context: any, req: any, deps: Dependencies = {}
): Promise<void> {
  const reply = (status: number, body: Record<string, unknown>) => {
    context.res = {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      },
      body
    };
  };
  const unavailable = () => reply(503, { ok: false, error: "REGISTRATION_HISTORY_UNAVAILABLE" });
  if (process.env.FEATURE_PERMANENT_VISITOR_REGISTRATION_HISTORY !== "true") {
    reply(404, { ok: false, error: "NOT_FOUND" });
    return;
  }
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) { reply(auth.status, auth.body); return; }
    const visibility = await readHighRiskStaffVisibility(req, deps.readStaff);
    if (!visibility.ok) { reply(visibility.status, visibility.body); return; }
    if (String(req?.method ?? "").toUpperCase() !== "GET") {
      reply(405, { ok: false, error: "METHOD_NOT_ALLOWED" }); return;
    }
    const visitorId: unknown = req?.params?.id;
    if (typeof visitorId !== "string" || !ID.test(visitorId)) {
      reply(400, { ok: false, error: "INVALID_VISITOR_ID" }); return;
    }
    const history = await (deps.readHistory ?? readCanonicalVisitorRegistrationFamilyHistory)(visitorId);
    if (history.status !== "ready") { unavailable(); return; }
    const currentConsent = await (deps.readConsent ?? readLatestRegistrationConsent)(visitorId);
    if (!["granted", "declined", "legacy_no_evidence", "unavailable"].includes(currentConsent)) {
      unavailable(); return;
    }
    // No raw receipt or child fingerprint is returned. For ordinary staff
    // only the attendance count is needed, not children's identifiers.
    const items = history.items.map(item => {
      const family = item.familyAttendance;
      return {
        submissionId: item.submissionId,
        serviceId: item.serviceId,
        recordedAt: item.recordedAt,
        visitType: item.visitType,
        churchHome: item.churchHome,
        interests: item.interests,
        invitedBy: item.invitedBy,
        contactConsentAtRegistration: item.contactConsentAtRegistration,
        familyAttendance: family.status === "recorded" ? {
          status: family.status,
          recordedAt: family.recordedAt,
          childCount: family.childCount,
          purpose: family.purpose,
          relationshipStatus: family.relationshipStatus,
          ...(visibility.canViewHighRiskAlerts ? { children: family.children.map(child => ({
            firstName: child.firstName, ageGroup: child.ageGroup
          })) } : {})
        } : { status: "not_confirmed" }
      };
    });
    reply(200, {
      ok: true, visitorId, currentConsent,
      childDetailsVisible: visibility.canViewHighRiskAlerts,
      history: { status: "ready", registrationCount: history.registrationCount, truncated: history.truncated, items }
    });
  } catch {
    unavailable();
  }
}
