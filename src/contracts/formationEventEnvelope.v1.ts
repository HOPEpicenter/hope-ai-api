export type FormationEventEnvelopeV1 = {
  v: 1;
  eventId: string;
  visitorId: string;
  type: string;
  occurredAt: string;
  source: { system: string };
  data?: Record<string, any>;
};

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function asObject(v: any): Record<string, any> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as any) : null;
}

/**
 * Strict v1 validator (LOCKED): only accepts the envelope shape.
 * Use this ONLY when request body clearly looks like v1.
 */
export function validateFormationEventEnvelopeV1Strict(body: unknown): FormationEventEnvelopeV1 {
  const o = asObject(body);
  if (!o) throw new Error("Body must be an object");

  if (o.v !== 1) throw new Error("v must be 1");
  if (!isNonEmptyString(o.eventId)) throw new Error("eventId is required");
  if (!isNonEmptyString(o.visitorId)) throw new Error("visitorId is required");
  if (!isNonEmptyString(o.type)) throw new Error("type is required");
  if (!isNonEmptyString(o.occurredAt)) throw new Error("occurredAt is required");

  const src = asObject((o as any).source);
  if (!src || !isNonEmptyString((src as any).system)) {
    throw new Error("source.system is required");
  }

  const data = (o as any).data;
  if (data !== undefined && asObject(data) === null) throw new Error("data must be an object if present");

  // Type-specific requirements (STRICT FOR V1)
  const t = String(o.type).trim();
  const d: any = asObject(data) ?? {};

  if (t === "FOLLOWUP_ASSIGNED") {
    const raw = (d as any)?.assigneeId ?? (d as any)?.assignedTo ?? (d as any)?.assignee;
    const assigneeId = typeof raw === "string" ? raw.trim() : "";
    if (!assigneeId) {
      throw new Error("FOLLOWUP_ASSIGNED requires data.assigneeId (string)");
    }
    // normalize to canonical key
    (d as any).assigneeId = assigneeId;
  }

  if (t === "FOLLOWUP_UNASSIGNED") {
    // no additional required data for v1
  }

  if (t === "NEXT_STEP_SELECTED") {
    if (!isNonEmptyString(d.nextStep)) {
      throw new Error("NEXT_STEP_SELECTED requires data.nextStep (string)");
    }
  }

  return o as FormationEventEnvelopeV1;
}

/**
 * Back-compat helper: determines whether the payload is "clearly v1".
 * (We only enforce strict-v1 when this returns true.)
 */
export function looksLikeFormationEnvelopeV1(body: any): boolean {
  if (!body || typeof body !== "object") return false;
  return body.v === 1 || isNonEmptyString(body.eventId) || (body.source && isNonEmptyString(body.source.system));
}
