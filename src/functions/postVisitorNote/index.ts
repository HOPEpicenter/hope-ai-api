import { randomUUID } from "crypto";
import { validateEngagementEventEnvelopeV1Strict } from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
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

function newNoteId(): string {
  return "note-" + randomUUID().replace(/-/g, "");
}

export async function postVisitorNote(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ...auth.body, authRejectedBy: "postVisitorNote" }
      };
      return;
    }

    const visitorId = String(req?.params?.visitorId ?? "").trim();
    const body = req?.body ?? {};

    const noteId = newNoteId();

    const data: Record<string, unknown> = {
      noteId,
      text: body.text
    };

    if (body.visibility !== undefined) {
      data.visibility = body.visibility;
    }

    const envelope = {
      v: 1 as const,
      eventId: newEventId(),
      visitorId,
      type: "note.add",
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
            message: "Visitor note validation failed",
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
        type: parsed.value.type
      }
    };
  } catch (err: any) {
    logFunctionError(context, "postVisitorNote", err, {
      requestId,
      visitorId: req?.params?.visitorId ?? null
    });

    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "VISITOR_NOTE_BAD_REQUEST",
        err?.message ?? "Bad Request",
        requestId
      )
    };
  }
}
