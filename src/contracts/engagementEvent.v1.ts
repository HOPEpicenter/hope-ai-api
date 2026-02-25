export type EngagementEventEnvelopeV1 = {
  v: 1;
  eventId: string;
  visitorId: string;
  type: string;
  occurredAt: string; // ISO-8601 (strict: must include timezone)
  source: {
    system: string;
    actorId?: string;
  };
  data?: Record<string, unknown>;
};

export type ValidationIssue = { path: string; message: string };
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

type ValidationMode = "strict" | "tolerant";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isIsoDateTimeStringTolerant(s: string): boolean {
  // tolerant: Date.parse must succeed, must look like datetime
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  return /T/.test(s);
}

function isIsoDateTimeStringStrictWithTz(s: string): boolean {
  // strict: must parse AND must end with Z or ±HH:MM
  if (!isIsoDateTimeStringTolerant(s)) return false;
  return /(Z|[+\-]\d{2}:\d{2})$/.test(s);
}

const RX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RX_EVENT_ID_STRICT =
  /^(evt-[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const RX_TAG = /^[a-z0-9][a-z0-9._-]{0,47}$/;

function normalizeEnvelopeValue(v: {
  eventId: string;
  visitorId: string;
  type: string;
  occurredAt: string;
  source: { system: string; actorId?: string };
  data?: Record<string, unknown>;
}): EngagementEventEnvelopeV1 {
  const t = v.type;

  const data: Record<string, unknown> = isRecord(v.data) ? { ...v.data } : {};

  if (t === "note.add" && typeof data.text === "string") {
    data.text = data.text.trim();
    if (typeof data.visibility === "string") {
      data.visibility = data.visibility.trim().toLowerCase();
    }
  }

  if ((t === "tag.add" || t === "tag.remove") && typeof data.tag === "string") {
    data.tag = data.tag.trim().toLowerCase();
  }

  return {
    v: 1,
    eventId: v.eventId,
    visitorId: v.visitorId,
    type: t,
    occurredAt: v.occurredAt,
    source: {
      system: v.source.system,
      actorId: v.source.actorId,
    },
    data,
  };
}

function validateEngagementEventEnvelopeV1Internal(
  input: unknown,
  mode: ValidationMode
): ValidationResult<EngagementEventEnvelopeV1> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: "", message: "body must be an object" }] };
  }

  const v = input.v;
  const eventId = input.eventId;
  const visitorId = input.visitorId;
  const type = input.type;
  const occurredAt = input.occurredAt;
  const source = input.source;
  const data = input.data;

  if (v !== 1) issues.push({ path: "v", message: "must be 1" });

  // eventId
  if (!isNonEmptyString(eventId)) {
    issues.push({ path: "eventId", message: "must be a string" });
  } else if (mode === "strict") {
    if (!RX_EVENT_ID_STRICT.test(eventId.trim())) {
      issues.push({
        path: "eventId",
        message: "must match evt-<32hex> or UUID",
      });
    }
  } else {
    // tolerant: allow broader, but keep a minimal length
    if (eventId.trim().length < 8) {
      issues.push({ path: "eventId", message: "must be a string (min 8 chars)" });
    }
  }

  // visitorId
  if (!isNonEmptyString(visitorId)) {
    issues.push({ path: "visitorId", message: "must be a string" });
  } else if (mode === "strict") {
    if (!RX_UUID.test(visitorId.trim())) {
      issues.push({ path: "visitorId", message: "must be a UUID" });
    }
  } else {
    if (visitorId.trim().length < 8) {
      issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });
    }
  }

  // type
  if (typeof type !== "string" || type.length < 1 || type.length > 128) {
    issues.push({ path: "type", message: "must be a string (1-128 chars)" });
  }

  // occurredAt
  if (typeof occurredAt !== "string") {
    issues.push({ path: "occurredAt", message: "must be an ISO-8601 datetime string" });
  } else {
    const ok =
      mode === "strict"
        ? isIsoDateTimeStringStrictWithTz(occurredAt)
        : isIsoDateTimeStringTolerant(occurredAt);

    if (!ok) {
      issues.push({
        path: "occurredAt",
        message:
          mode === "strict"
            ? "must be an ISO-8601 datetime string with timezone (Z or ±HH:MM)"
            : "must be an ISO-8601 datetime string",
      });
    }
  }

  // source
  if (!isRecord(source)) {
    issues.push({ path: "source", message: "must be an object" });
  } else {
    if (typeof source.system !== "string" || source.system.trim().length < 1 || source.system.trim().length > 64) {
      issues.push({ path: "source.system", message: "must be a string (1-64 chars)" });
    }
    if (
      source.actorId !== undefined &&
      (typeof source.actorId !== "string" || source.actorId.trim().length < 1 || source.actorId.trim().length > 128)
    ) {
      issues.push({ path: "source.actorId", message: "must be a string (1-128 chars) if provided" });
    }
  }

  // data shape
  if (data !== undefined && !isRecord(data)) {
    issues.push({ path: "data", message: "must be an object if provided" });
  }

  // type-specific data checks (strict AND tolerant — these are part of the v1 contract)
  if (type === "status.transition") {
    if (!isRecord(data)) {
      issues.push({ path: "data", message: "status.transition requires data object" });
    } else {
      const from = (data as any).from;
      const to = (data as any).to;
      const reason = (data as any).reason;

      if (typeof from !== "string" || from.trim().length < 1 || from.trim().length > 64) {
        issues.push({ path: "data.from", message: "must be a string (1-64 chars)" });
      }
      if (typeof to !== "string" || to.trim().length < 1 || to.trim().length > 64) {
        issues.push({ path: "data.to", message: "must be a string (1-64 chars)" });
      }
      if (reason !== undefined && (typeof reason !== "string" || reason.length > 256)) {
        issues.push({ path: "data.reason", message: "must be a string (<=256 chars) if provided" });
      }
    }
  }

  if (type === "note.add") {
    if (!isRecord(data)) {
      issues.push({ path: "data", message: "note.add requires data object" });
    } else {
      const text = (data as any).text;
      const visibility = (data as any).visibility;

      if (typeof text !== "string") {
        issues.push({ path: "data.text", message: "must be a string" });
      } else {
        const t = text.trim();
        if (t.length < 1 || t.length > 2000) {
          issues.push({ path: "data.text", message: "must be a string (1-2000 chars)" });
        }
      }

      if (visibility !== undefined) {
        if (typeof visibility !== "string") {
          issues.push({ path: "data.visibility", message: "must be a string if provided" });
        } else {
          const v = visibility.trim().toLowerCase();
          if (v !== "team" && v !== "private") {
            issues.push({ path: "data.visibility", message: "must be 'team' or 'private' if provided" });
          }
        }
      }
    }
  }

  if (type === "tag.add" || type === "tag.remove") {
    if (!isRecord(data)) {
      issues.push({ path: "data", message: `${type} requires data object` });
    } else {
      const tag = (data as any).tag;
      if (typeof tag !== "string") {
        issues.push({ path: "data.tag", message: "must be a string" });
      } else {
        const t = tag.trim().toLowerCase();
        if (t.length < 1 || t.length > 48) {
          issues.push({ path: "data.tag", message: "must be a string (1-48 chars)" });
        }
        if (!RX_TAG.test(t)) {
          issues.push({ path: "data.tag", message: "must match ^[a-z0-9][a-z0-9._-]{0,47}$" });
        }
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  const normalized = normalizeEnvelopeValue({
    eventId: (eventId as string).trim(),
    visitorId: (visitorId as string).trim(),
    type: (type as string).trim(),
    occurredAt: (occurredAt as string).trim(),
    source: {
      system: isRecord(source) ? String((source as any).system ?? "").trim() : "",
      actorId: isRecord(source) && (source as any).actorId !== undefined ? String((source as any).actorId).trim() : undefined,
    },
    data: isRecord(data) ? (data as Record<string, unknown>) : undefined,
  });

  return { ok: true, value: normalized };
}

/**
 * Tolerant validator: intended for internal/back-compat parsing and normalization.
 * NOTE: Type-specific required fields are still enforced.
 */
export function validateEngagementEventEnvelopeV1(input: unknown): ValidationResult<EngagementEventEnvelopeV1> {
  return validateEngagementEventEnvelopeV1Internal(input, "tolerant");
}

/**
 * Strict validator: intended for public ingestion contract on POST /api/engagements/events.
 */
export function validateEngagementEventEnvelopeV1Strict(input: unknown): ValidationResult<EngagementEventEnvelopeV1> {
  return validateEngagementEventEnvelopeV1Internal(input, "strict");
}