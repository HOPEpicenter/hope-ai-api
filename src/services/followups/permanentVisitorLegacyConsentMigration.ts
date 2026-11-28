import { createHash } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import type { createPermanentVisitorConsentRepository } from "../../repositories/permanentVisitorConsentRepository";

type Repository = ReturnType<typeof createPermanentVisitorConsentRepository>;
type Row = Record<string, unknown>;
type Classification = "no_evidence" | "unverified_yes" | "historical_no" | "conflicting";
type Assessment = { status: "candidate"; classification: Classification; evidenceId: string; receiptCount: number }
  | { status: "preserved" | "unavailable" | "not_legacy" };
type Execution = { status: "migrated" | "preserved" | "unavailable" | "not_legacy" | "evidence_changed" };
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX = 2000;
function iso(v: unknown): v is string { return typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v; }
function hash(v: unknown): string { return createHash("sha256").update(JSON.stringify(v)).digest("hex"); }
function unavailable(): {status:"unavailable"} { return {status:"unavailable"}; }
const choices = ["church_events", "growing_in_faith", "prayer", "small_groups"];
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

/** Inactive per-visitor migration foundation. No environment, scheduler, HTTP
 * entry point or default client. The caller must establish authorization and
 * quiescence of legacy consent writers before any future live execution.
 * Historical public declarations are NOT identity or permission proof.
 * A migration initializes unknown only; even a historical No remains blocked.
 * No attendance, profile, plan or communication writes occur here.
 */
export function createLegacyVisitorConsentMigration(deps: {
  visitors: Pick<TableClient, "getEntity" | "listEntities">;
  repository: Pick<Repository, "read" | "apply">;
  cutoff: string;
}) {
  async function assess(visitorId: string): Promise<Assessment> {
    try {
      if (typeof visitorId !== "string" || !ID.test(visitorId) || !iso(deps.cutoff)) return unavailable();
      const current = await deps.repository.read(visitorId);
      if (current.status === "ready") return {status:"preserved"};
      if (current.status !== "not_initialized") return unavailable();
      const profile = await deps.visitors.getEntity<Row>("VISITOR", visitorId);
      if (profile.partitionKey !== "VISITOR" || profile.rowKey !== visitorId || !iso(profile.createdAt)) return unavailable();
      if (profile.createdAt >= deps.cutoff) return {status:"not_legacy"};
      const seen = new Set<string>();
      const evidence: string[] = [];
      let yes = false, no = false;
      const filter = `PartitionKey eq 'VISITOR_CHECK_IN' and visitorId eq '${visitorId}'`;
      for await (const row of deps.visitors.listEntities<Row>({queryOptions:{filter}})) {
        if (seen.size >= MAX || row.partitionKey !== "VISITOR_CHECK_IN" || row.visitorId !== visitorId ||
            typeof row.rowKey !== "string" || !UUID.test(row.rowKey) || seen.has(row.rowKey) || !iso(row.recordedAt)) return unavailable();
        seen.add(row.rowKey);
        if (row.registrationDetailsJson === undefined) continue;
        if (row.recordedAt >= deps.cutoff || row.recordedAt < profile.createdAt || typeof row.serviceId !== "string" || !ID.test(row.serviceId)) return unavailable();
        const d = details(row.registrationDetailsJson);
        if (!d) return unavailable();
        if (d.consent) yes = true; else no = true;
        evidence.push(hash([row.rowKey,row.serviceId,row.recordedAt,d.raw]));
      }
      const classification: Classification = yes && no ? "conflicting" : no ? "historical_no" : yes ? "unverified_yes" : "no_evidence";
      // Persist only a classification and digest in the existing immutable
      // initialization receipt. No historical contact data is copied there.
      const evidenceId = `legacy-v1:${classification}:${hash([visitorId,deps.cutoff,profile.createdAt,evidence.sort()])}`;
      return {status:"candidate",classification,evidenceId,receiptCount:evidence.length};
    } catch { return unavailable(); }
  }
  async function execute(visitorId: string, expectedEvidenceId: string): Promise<Execution> {
    try {
      if (typeof expectedEvidenceId !== "string" || !/^legacy-v1:(no_evidence|unverified_yes|historical_no|conflicting):[0-9a-f]{64}$/.test(expectedEvidenceId)) return unavailable();
      const fresh = await assess(visitorId);
      if (fresh.status !== "candidate") return {status:fresh.status};
      if (fresh.evidenceId !== expectedEvidenceId) return {status:"evidence_changed"};
      const outcome = await deps.repository.apply(visitorId,{kind:"existing_profile",evidenceId:fresh.evidenceId});
      if (outcome.status === "committed" || outcome.status === "replayed") return {status:"migrated"};
      // If another writer won initialization, preserve it. Never rebase
      // migration onto a current state or override an existing decision.
      if (outcome.status === "rejected" && (await deps.repository.read(visitorId)).status === "ready") return {status:"preserved"};
      return unavailable();
    } catch { return unavailable(); }
  }
  return {assess,execute};
}
