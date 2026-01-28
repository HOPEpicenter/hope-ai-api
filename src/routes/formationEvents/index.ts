import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { FormationEventRepository } from "../../storage/formationEventRepository";
import { recordFormationEvent } from "../../domain/formation/recordFormationEvent";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";

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
  const {
    visitorId,
    type,
    occurredAt,
    id,
    // allow extra optional fields for the domain recorder
    channel,
    visibility,
    sensitivity,
    summary,
    metadata,
    idempotencyKey,
  } = req.body || {};

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
    return res.status(201).json({
      id: id ?? idempotencyKey,
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
        if (existing) return res.status(200).json(existing);
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
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    const out = await eventsRepo.listByVisitor(visitorId, limit, cursor);
    return res.status(200).json({ ok: true, visitorId, items: out.items, cursor: out.cursor });
  } catch (e: any) {
    return res.status(toHttpStatus(e, 400)).json({ ok: false, error: e?.message || "Bad Request" });
  }
});

// GET /visitors/:id/formation/profile
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