import { readCanonicalStaffIdentity } from "../../services/staff/readCanonicalStaffDirectory";

function header(req: any, name: string): string {
  return String(
    (typeof req?.headers?.get === "function" ? req.headers.get(name) : null) ??
    req?.headers?.[name] ?? req?.headers?.[name.toUpperCase()] ?? req?.get?.(name) ?? ""
  ).trim();
}

export async function requireMinistryCommunicationStaffActor(req: any):
  Promise<{ ok: true; actorId: string } | { ok: false; status: number; body: Record<string, unknown> }> {
  const actorId = header(req, "x-hope-staff-actor-id");
  if (!actorId) return { ok: false, status: 401, body: { ok: false, error: "Missing x-hope-staff-actor-id" } };
  const actor = await readCanonicalStaffIdentity(actorId);
  if (!actor || actor.status !== "active") return { ok: false, status: 403, body: { ok: false, error: "x-hope-staff-actor-id must reference an active canonical Staff identity" } };
  return { ok: true, actorId: actor.staffId };
}
