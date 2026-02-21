export type EngagementEventEnvelopeV1 = {
  v: 1;
  eventId: string;
  visitorId: string;
  type: string;
  occurredAt: string; // ISO-8601
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isIsoDateTimeString(s: string): boolean {
  // minimal: Date.parse must succeed and string must look like ISO
  if (!s || typeof s !== "string") return false;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  return /T/.test(s);
}

export function validateEngagementEventEnvelopeV1(input: unknown): ValidationResult<EngagementEventEnvelopeV1> {
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
  if (typeof eventId !== "string" || eventId.length < 8) issues.push({ path: "eventId", message: "must be a string (min 8 chars)" });
  if (typeof visitorId !== "string" || visitorId.length < 8) issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });
  if (typeof type !== "string" || type.length < 1 || type.length > 128) issues.push({ path: "type", message: "must be a string (1-128 chars)" });
  if (typeof occurredAt !== "string" || !isIsoDateTimeString(occurredAt)) issues.push({ path: "occurredAt", message: "must be an ISO-8601 datetime string" });

  if (!isRecord(source)) {
    issues.push({ path: "source", message: "must be an object" });
  } else {
    if (typeof source.system !== "string" || source.system.length < 1 || source.system.length > 64) {
      issues.push({ path: "source.system", message: "must be a string (1-64 chars)" });
    }
    if (source.actorId !== undefined && (typeof source.actorId !== "string" || source.actorId.length < 1 || source.actorId.length > 128)) {
      issues.push({ path: "source.actorId", message: "must be a string (1-128 chars) if provided" });
    }
  }

  if (data !== undefined && !isRecord(data)) {
    issues.push({ path: "data", message: "must be an object if provided" });
  }

  // Status transitions v1: prefer as events; auditable/derivable
  if (type === "status.transition") {
    if (!isRecord(data)) {
      issues.push({ path: "data", message: "status.transition requires data object" });
    } else {
      const from = data.from;
      const to = data.to;
      const reason = data.reason;
      if (typeof from !== "string" || from.length < 1 || from.length > 64) issues.push({ path: "data.from", message: "must be a string (1-64 chars)" });
      if (typeof to !== "string" || to.length < 1 || to.length > 64) issues.push({ path: "data.to", message: "must be a string (1-64 chars)" });
      if (reason !== undefined && (typeof reason !== "string" || reason.length > 256)) issues.push({ path: "data.reason", message: "must be a string (<=256 chars) if provided" });
    }
  }

  // Notes + tags v1 (ministry-friendly; append-only, derive views later)
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
        if (t.length < 1 || t.length > 2000) issues.push({ path: "data.text", message: "must be a string (1-2000 chars)" });
      }

      if (visibility !== undefined) {
        if (typeof visibility !== "string") {
          issues.push({ path: "data.visibility", message: "must be a string if provided" });
        } else {
          const v = visibility.trim().toLowerCase();
          if (v !== "team" && v !== "private") issues.push({ path: "data.visibility", message: "must be 'team' or 'private' if provided" });
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
        // slug-ish: 1..48, starts with alnum, then alnum/._-
        if (t.length < 1 || t.length > 48) issues.push({ path: "data.tag", message: "must be a string (1-48 chars)" });
        if (!/^[a-z0-9][a-z0-9._-]{0,47}$/.test(t)) issues.push({ path: "data.tag", message: "must match ^[a-z0-9][a-z0-9._-]{0,47}$" });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

    return {
    ok: true,
    value: {
      v: 1,
      eventId: eventId as string,
      visitorId: visitorId as string,
      type: type as string,
      occurredAt: occurredAt as string,
      source: {
        system: (source as any).system as string,
        actorId: (source as any).actorId as string | undefined,
      },
      data: (() => {
        const d: any = (data as any) ?? {};
        const t = (type as any) as string;

        if (t === "note.add" && typeof d.text === "string") {
          d.text = d.text.trim();
          if (typeof d.visibility === "string") d.visibility = d.visibility.trim().toLowerCase();
        }

        if ((t === "tag.add" || t === "tag.remove") && typeof d.tag === "string") {
          d.tag = d.tag.trim().toLowerCase();
        }

        return d;
      })(),
    },
  };
}

