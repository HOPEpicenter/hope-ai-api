import { randomUUID } from "crypto";
import { validateEngagementEventEnvelopeV1Strict } from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { readCanonicalPastoralNote } from "../../services/engagements/readCanonicalPastoralNotes";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import { requireApiKeyForFunction } from "../_shared/apiKey";

const service = new EngagementsService(new EngagementEventsRepository());

function newEventId(): string {
  return "evt-" + randomUUID().replace(/-/g, "");
}

export async function patchVisitorNote(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ...auth.body, authRejectedBy: "patchVisitorNote" }
      };
      return;
    }

    const visitorId = String(req?.params?.visitorId ?? "").trim();
    const noteId = String(req?.params?.noteId ?? "").trim();
    const body = req?.body ?? {};

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, requestId, error: "visitorId is required" }
      };
      return;
    }

    if (!noteId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, requestId, error: "noteId is required" }
      };
      return;
    }

    const existing = await readCanonicalPastoralNote(visitorId, noteId);

    if (!existing) {
      context.res = {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, requestId, error: "note not found" }
      };
      return;
    }

    const text = typeof body.text === "string" ? body.text : "";
    const visibility =
      body.visibility !== undefined ? body.visibility : existing.visibility;

    const data: Record<string, unknown> = {
      noteId,
      text,
      version: existing.version + 1,
      visibility
    };

    if (body.reason !== undefined) {
      data.reason = body.reason;
    }

    const envelope = {
      v: 1 as const,
      eventId: newEventId(),
      visitorId,
      type: "note.updated",
      occurredAt: new Date().toISOString(),
      source: {
        system: "visitor-notes-command"
      },
      data
    };

    const parsed = validateEngagementEventEnvelopeV1Strict(envelope);

    if (!parsed.ok) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
          requestId,
          error: {
            code: "VALIDATION_ERROR",
            message: "Visitor note update validation failed",
            details: parsed.issues
          }
        }
      };
      return;
    }

    await service.appendEvent(parsed.value);

    context.res = {
      status: 202,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        accepted: true,
        v: 1,
        eventId: parsed.value.eventId,
        noteId,
        visitorId: parsed.value.visitorId,
        type: parsed.value.type,
        version: parsed.value.data?.version
      }
    };
  } catch (err: any) {
    logFunctionError(context, "patchVisitorNote", err, {
      requestId,
      visitorId: req?.params?.visitorId ?? null,
      noteId: req?.params?.noteId ?? null
    });

    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "VISITOR_NOTE_UPDATE_BAD_REQUEST",
        err?.message ?? "Bad Request",
        requestId
      )
    };
  }
}