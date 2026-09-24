import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationEventsTableClient,
  listFormationEventsByVisitorId,
  readCorrectionAwareFormationEvents,
  CorrectionReplayUnavailableError
} from "../_shared/formation";
import {
  NEXT_STEP_COMPLETION_CORRECTED,
  resolveEffectiveNextStepCompletionEvents
} from "../../domain/formation/effectiveNextStepCompletionEvents";

function parseLimit(val: unknown, fallback = 50): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 200));
}

export async function getVisitorFormationEvents(context: any, req: any): Promise<void> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
      return;
    }

    const visitorId = String(req?.params?.id ?? "").trim();
    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const limit = parseLimit(req?.query?.limit, 50);
    const cursor = req?.query?.cursor ? String(req.query.cursor) : undefined;

    const table = getFormationEventsTableClient();
    await ensureTable(table);

    const correctionAware = await readCorrectionAwareFormationEvents(visitorId);
    const auditEvents = correctionAware.events ??
      await listFormationEventsByVisitorId(table, visitorId, {
        limit,
        beforeRowKey: cursor
      });
    const resolution = resolveEffectiveNextStepCompletionEvents(auditEvents);
    const effectiveEventIds = new Set(
      resolution.effectiveEvents.map(event => event.idempotencyKey ?? event.rowKey)
    );
    const pageEvents = correctionAware.events && cursor
      ? auditEvents.filter(event => event.rowKey < cursor)
      : auditEvents;

    const items = pageEvents.slice(0, limit)
      .map((event: any) => {
        let metadataObj: any = undefined;
        try {
          if (typeof event.metadata === "string" && event.metadata.trim()) {
            metadataObj = JSON.parse(event.metadata);
          }
        } catch {
          metadataObj = undefined;
        }

        return {
          id: event.idempotencyKey ?? event.rowKey,
          visitorId: event.visitorId,
          type: event.type,
          occurredAt: event.occurredAt,
          recordedAt: event.recordedAt,
          channel: event.channel,
          visibility: event.visibility,
          sensitivity: event.sensitivity,
          summary: event.summary,
          metadata: metadataObj,
          rowKey: event.rowKey,
          effective:
            event.type === NEXT_STEP_COMPLETION_CORRECTED
              ? false
              : effectiveEventIds.has(event.idempotencyKey ?? event.rowKey)
        };
      });

    const nextCursor =
      items.length > 0
        ? items[items.length - 1].rowKey
        : null;

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitorId,
        items,
        cursor: nextCursor,
        nextCursor
      }
    };
  } catch (err: any) {
    if (err instanceof CorrectionReplayUnavailableError) {
      context.res = {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
          error: err.code
        }
      };
      return;
    }

    context.log.error(err?.message ?? err);
    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: err?.message ?? "Bad Request" }
    };
  }
}
