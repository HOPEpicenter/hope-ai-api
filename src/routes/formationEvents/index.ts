import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { FormationEventRepository } from "../../storage/formationEventRepository";
import { recordFormationEvent } from "../../domain/formation/recordFormationEvent";
import { listFormationEventsByVisitor } from "../../storage/formation/formationEventsRepo";
import { getFormationProfilesTableClient, getFormationEventsTableClient } from "../../storage/formation/formationTables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationProfile, listFormationProfiles } from "../../storage/formation/formationProfilesRepo";

export const formationEventsRouter = Router();
formationEventsRouter.use(requireApiKey);

// Keep repo for list endpoints (paging semantics already proven)
const eventsRepo = new FormationEventRepository();

function isConflictAlreadyExists(err: any): boolean {
  const status = err?.statusCode ?? err?.status;
  const code =
    err?.details?.odataError?.code ??
    err?.details?.errorCode ??
    err?.code ??
    err?.name;

  const msg = String(err?.message ?? "");
  const msgHasAlreadyExists =
    msg.includes("EntityAlreadyExists") ||
    msg.includes("The specified entity already exists") ||
    (msg.includes("odata.error") && msg.includes("AlreadyExists"));

  return status === 409 || code === "EntityAlreadyExists" || msgHasAlreadyExists;
}

function toHttpStatus(err: any, fallback = 400): number {
  const s = err?.statusCode ?? err?.status;
  const n = typeof s === "number" ? s : parseInt(String(s ?? ""), 10);
  return Number.isFinite(n) && n >= 100 && n <= 599 ? n : fallback;
}

// POST /formation/events  (mounted under /api in src/index.ts)
// Now uses the domain recorder so we ALWAYS update FormationProfile snapshot.
formationEventsRouter.post("/formation/events", async (req, res) => {
  const body = req.body || {};

  // Accept both legacy and envelope v1
  const visitorId = body.visitorId;
  const type = body.type;
  const occurredAt = body.occurredAt;

  const id = body.id ?? body.eventId;
  const metadata = body.metadata ?? body.data;
  const idempotencyKey = body.idempotencyKey ?? body.eventId;

  const {
    channel,
    visibility,
    sensitivity,
    summary,
  } = body;

  const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!storageConnectionString) {
    return res.status(500).json({ ok: false, error: "Missing STORAGE_CONNECTION_STRING" });
  }

  try {
    // recordFormationEvent writes:
    // - append-only event entity
    // - upserts FormationProfile snapshot
    const out = await recordFormationEvent(
      {
        visitorId,
        type,
        occurredAt,
        // carry these if provided
        channel,
        visibility,
        sensitivity,
        summary,
        metadata,
        idempotencyKey: id ?? idempotencyKey,
      } as any,
      { storageConnectionString }
    );

    // For HTTP response: preserve existing contract expected by asserts:
    // return an object that includes an "id" key when client supplied one.
    // (Your idempotency assert checks response.id === clientId.)
    return res.status(201).json({ ok: true, accepted: true, id: id ?? idempotencyKey,
      visitorId,
      type,
      occurredAt: occurredAt ?? new Date().toISOString(),
      rowKey: out.eventRowKey,
      profile: out.profile,
    });
  } catch (e: any) {
    // Idempotent retry: if client supplied an id and entity already exists, return existing.
    if ((id || idempotencyKey) && isConflictAlreadyExists(e)) {
      try {
        const existing = await eventsRepo.getByVisitorAndId(String(visitorId ?? "").trim(), String(id ?? idempotencyKey));
        if (existing) return res.status(200).json({ ok: true, ...existing });
      } catch {
        // fall through
      }
      return res.status(409).json({ ok: false, error: "EntityAlreadyExists" });
    }

    return res.status(toHttpStatus(e, 400)).json({ ok: false, error: e?.message || "Bad Request" });
  }
});

// GET /visitors/:id/formation/events?limit=&cursor=
formationEventsRouter.get("/visitors/:id/formation/events", async (req, res) => {
  try {
    const visitorId = String(req.params.id || "").trim();

    const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!storageConnectionString) {
      return res.status(500).json({ ok: false, error: "Missing STORAGE_CONNECTION_STRING" });
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

    // Cursor is a RowKey (from previous response). We use it as "beforeRowKey" (older-than paging).
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    const eventsTable = getFormationEventsTableClient(storageConnectionString);
    await ensureTableExists(eventsTable);

    // Azure Tables lists ascending RowKey within PartitionKey (oldest -> newest).
    const fetchLimit = Math.max(500, limit * 50);

const ascAll = await listFormationEventsByVisitor(eventsTable as any, visitorId, {
  limit: fetchLimit,
  beforeRowKey: cursor,
});

// Keep only the newest 'limit' events in ascending order
const start = Math.max(0, ascAll.length - limit);
    const pageAsc = ascAll.slice(start);
    // For API clients + scripts, return newest-first
    const items = pageAsc
      .slice()
      .reverse()
      .map((e: any) => {
        let metadataObj: any = undefined;
        try {
          if (typeof e.metadata === "string" && e.metadata.trim()) metadataObj = JSON.parse(e.metadata);
        } catch {
          metadataObj = undefined;
        }

        return {
          // scripts historically expect "id" sometimes; prefer idempotencyKey if present
          id: e.idempotencyKey ?? e.rowKey,
          visitorId: e.visitorId,
          type: e.type,
          occurredAt: e.occurredAt,
          recordedAt: e.recordedAt,
          channel: e.channel,
          visibility: e.visibility,
          sensitivity: e.sensitivity,
          summary: e.summary,
          metadata: metadataObj,
          rowKey: e.rowKey,
        };
      });

    // Next cursor should represent "older than this" => the smallest RowKey returned (oldest in this page).
    const nextCursor = pageAsc.length > 0 ? (pageAsc[0] as any).rowKey : null;

    // Return both names to be extra compatible with scripts
    return res.status(200).json({ ok: true, visitorId, items, cursor: nextCursor, nextCursor });
  } catch (e: any) {
    return res.status(toHttpStatus(e, 400)).json({ ok: false, error: e?.message || "Bad Request" });
  }
});

// GET /visitors/:id/formation/profile

/**
 * GET /formation/profiles?limit=&cursor=&stage=&assignedTo=&q=
 * Lists FormationProfile snapshots for Ops dashboard (paged).
 */
formationEventsRouter.get("/formation/profiles", async (req, res) => {
  try {
    const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!storageConnectionString) {
      return res.status(500).json({ ok: false, error: "Missing STORAGE_CONNECTION_STRING" });
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    const stage = req.query.stage ? String(req.query.stage).trim() : undefined;
    const assignedTo = req.query.assignedTo ? String(req.query.assignedTo).trim() : undefined;
    const q = req.query.q ? String(req.query.q).trim() : undefined;
    const visitorIdQ = req.query.visitorId ? String(req.query.visitorId).trim() : undefined;

    const profilesTable = getFormationProfilesTableClient(storageConnectionString);
    await ensureTableExists(profilesTable);

    let items: any[] = [];
let nextCursor: string | null = null;

if (visitorIdQ) {
  const one = await getFormationProfile(profilesTable as any, visitorIdQ);
  items = one ? [one] : [];
} else {
  const out = await listFormationProfiles(profilesTable as any, {
    limit,
    cursor,
    stage,
    assignedTo,
    q,
  });
  items = out.items;
  nextCursor = (out.cursor ?? null) as any;
}

    return res.status(200).json({ ok: true, items, cursor: nextCursor });
  } catch (e: any) {
    return res.status(toHttpStatus(e, 400)).json({ ok: false, error: e?.message || "Bad Request" });
  }
});
formationEventsRouter.get("/visitors/:id/formation/profile", async (req, res) => {
  try {
    const visitorId = String(req.params.id || "").trim();
    const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!storageConnectionString) {
      return res.status(500).json({ ok: false, error: "Missing STORAGE_CONNECTION_STRING" });
    }

    const profilesTable = getFormationProfilesTableClient(storageConnectionString);
    await ensureTableExists(profilesTable);

    const profile = await getFormationProfile(profilesTable as any, visitorId);
    return res.status(200).json({ ok: true, visitorId, profile: profile ?? null });
  } catch (e: any) {
    return res.status(toHttpStatus(e, 400)).json({ ok: false, error: e?.message || "Bad Request" });
  }
});

