import { createHash } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import type { createPermanentVisitorConsentRepository } from "../../repositories/permanentVisitorConsentRepository";

type Repository = ReturnType<typeof createPermanentVisitorConsentRepository>;
type Evidence = Readonly<{ visitorId: string; submissionId: string; serviceId: string }>;
type Result = { status: "recorded" | "unavailable" };
type Row = Record<string, unknown>;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const choices = ["church_events", "growing_in_faith", "prayer", "small_groups"];
function id(v: unknown): v is string { return typeof v === "string" && ID.test(v); }
function iso(v: unknown): v is string { return typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v; }
function object(v: unknown): v is Row { return v !== null && typeof v === "object" && !Array.isArray(v); }
function exact(v: Row, keys: string[]): boolean { return Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v,k)); }
function text(v: unknown, limit: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= limit && !/[\u0000-\u001f\u007f]/.test(v) && v === v.normalize("NFC").trim().replace(/\s+/g, " ");
}
function details(raw: unknown) {
  if (typeof raw !== "string" || Buffer.byteLength(raw,"utf8") > 8192) return null;
  const d: unknown = JSON.parse(raw);
  if (!object(d) || !exact(d,["version","name","email","phone","visitType","churchHome","interests","invitedBy","contactConsent"]) ||
      d.version !== 1 || !text(d.name,160) || typeof d.contactConsent !== "boolean" ||
      (d.email !== null && (!text(d.email,254) || d.email !== d.email.toLowerCase() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))) ||
      (d.phone !== null && (typeof d.phone !== "string" || !/^\d{7,15}$/.test(d.phone))) ||
      (d.email === null && d.phone === null) || (d.visitType !== "first" && d.visitType !== "returning") ||
      (d.churchHome !== null && (typeof d.churchHome !== "string" || !["yes","no","looking","prefer_not_to_say"].includes(d.churchHome))) ||
      !Array.isArray(d.interests) || d.interests.length > 4 || d.interests.some(x => typeof x !== "string" || !choices.includes(x)) ||
      new Set(d.interests).size !== d.interests.length || JSON.stringify([...d.interests].sort()) !== JSON.stringify(d.interests) ||
      (d.invitedBy !== null && !text(d.invitedBy,120))) return null;
  return { name: d.name, email: d.email as string | null, phone: d.phone as string | null, consent: d.contactConsent, raw };
}
const unavailable = (): Result => ({ status: "unavailable" });
const recorded = (): Result => ({ status: "recorded" });

/** Inactive internal adapter; no default storage, env reads or caller authorization.
 * Trusted callers must have already admitted the registration. The cutover is
 * supplied by a future verified migration boundary, never by a browser.
 * A recorded outcome is historical processing evidence, NOT contact permission.
 * Existing-profile bootstrap deliberately grants nothing; legacy migration is separate.
 */
export function createPermanentVisitorRegistrationConsentAdapter(deps: {
  visitors: Pick<TableClient,"getEntity">;
  repository: Pick<Repository,"read"|"apply"|"inspectOperation">;
  initialGrantNotBefore: string;
}) {
  return async function recordRegistrationConsent(input: Evidence): Promise<Result> {
    try {
      if (!object(input) || !exact(input,["visitorId","submissionId","serviceId"]) ||
          !id(input.visitorId) || !id(input.serviceId) || typeof input.submissionId !== "string" ||
          !UUID.test(input.submissionId) || !iso(deps.initialGrantNotBefore)) return unavailable();
      const { visitorId, submissionId, serviceId } = input;
      const receipt = await deps.visitors.getEntity<Row>("VISITOR_CHECK_IN", submissionId);
      const claim = await deps.visitors.getEntity<Row>("VISITOR_CHECK_IN_CLAIM", submissionId);
      const profile = await deps.visitors.getEntity<Row>("VISITOR", visitorId);
      if (receipt.partitionKey !== "VISITOR_CHECK_IN" || receipt.rowKey !== submissionId || receipt.visitorId !== visitorId ||
          receipt.serviceId !== serviceId || !iso(receipt.recordedAt) || claim.partitionKey !== "VISITOR_CHECK_IN_CLAIM" ||
          claim.rowKey !== submissionId || claim.visitorId !== visitorId || typeof claim.createProfile !== "boolean" ||
          !iso(claim.claimedAt) || claim.claimedAt > receipt.recordedAt || profile.partitionKey !== "VISITOR" || profile.rowKey !== visitorId) return unavailable();
      const d = details(receipt.registrationDetailsJson);
      if (!d) return unavailable();
      const fingerprint = createHash("sha256").update(JSON.stringify([
        "complete-public-visitor-arrival-v1", serviceId, d.name.toLowerCase(), d.email ?? "", d.phone ?? "", d.raw
      ])).digest("hex");
      if (claim.fingerprint !== fingerprint) return unavailable();
      // Exact immutable creation marker, timestamp and claim classification.
      // A contradictory marker is corruption, not an existing-profile fallback.
      const ownsCreation = profile.checkInCreationId === submissionId;
      if (claim.createProfile !== ownsCreation || (ownsCreation && profile.createdAt !== claim.claimedAt)) return unavailable();
      const prior = await deps.repository.inspectOperation(visitorId, submissionId);
      if (prior.status === "found") {
        const op = prior.operation;
        if (op.kind === "new_profile" && ownsCreation && op.evidenceId === submissionId && op.initialConsent === d.consent) return recorded();
        if (op.kind === "public_request" && op.requestId === submissionId && op.requestedConsent === d.consent) return recorded();
        return unavailable();
      }
      if (prior.status !== "not_found") return unavailable();
      let current = await deps.repository.read(visitorId);
      if (current.status === "not_initialized") {
        const postCutover = claim.claimedAt >= deps.initialGrantNotBefore && receipt.recordedAt >= deps.initialGrantNotBefore;
        if (ownsCreation && postCutover) {
          // Require exact canonical contact fields before any initial grant.
          if (profile.name !== d.name || (profile.email ?? null) !== d.email || (profile.emailLower ?? null) !== d.email ||
              (profile.phone ?? null) !== d.phone || (profile.phoneCanonical ?? null) !== d.phone) return unavailable();
          const result = await deps.repository.apply(visitorId, { kind: "new_profile", evidenceId: submissionId, initialConsent: d.consent });
          return result.status === "committed" || result.status === "replayed" ? recorded() : unavailable();
        }
        // No new authority from historical or pre-existing profiles. Reserve
        // a separate deterministic bootstrap ID, never the public operation ID.
        const bootstrap = await deps.repository.apply(visitorId, { kind: "existing_profile", evidenceId: `bootstrap:${submissionId}` });
        if (bootstrap.status !== "committed" && bootstrap.status !== "replayed") return unavailable();
        current = await deps.repository.read(visitorId);
      }
      if (current.status !== "ready") return unavailable();
      const applied = await deps.repository.apply(visitorId, { kind: "public_request", requestId: submissionId,
        expectedRevision: current.state.revision, requestedConsent: d.consent });
      // No auto-rebase on conflict or uncertainty. An explicit exact retry
      // rechecks the immutable operation receipt before choosing a revision.
      return applied.status === "committed" || applied.status === "replayed" ? recorded() : unavailable();
    } catch { return unavailable(); }
  };
}
