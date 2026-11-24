import {
  createVisitorEvent,
  type VisitorEventWriter
} from "../../services/visitors/createVisitorEvent";
import {
  createVisitorEventTableWriter
} from "../../services/visitors/visitorEventTableWriter";
import {
  requireAdminStaffActorForFunction,
  type RequiredAdminStaffActor
} from "../_shared/adminStaffActor";

type Dependencies = {
  authorize?: (req: any) => Promise<RequiredAdminStaffActor>;
  writer?: VisitorEventWriter;
};

function respond(
  context: any,
  status: number,
  body: Record<string, unknown>
): void {
  context.res = { status, body };
}

/**
 * Administrative visitor event creation.
 *
 * Deliberately NOT registered as an Azure Function yet.
 * Authorization must succeed before a storage writer is constructed.
 */
export async function postVisitorEvent(
  context: any,
  req: any,
  dependencies: Dependencies = {}
): Promise<void> {
  try {
    const authorize =
      dependencies.authorize ?? requireAdminStaffActorForFunction;

    const auth = await authorize(req);

    if (!auth.ok) {
      respond(context, auth.status, auth.body);
      return;
    }

    if (req?.method !== "POST") {
      respond(context, 405, {
        ok: false,
        error: "method_not_allowed"
      });
      return;
    }

    const body = req?.body;

    if (!body || typeof body !== "object" ||
        Array.isArray(body)) {
      respond(context, 400, {
        ok: false,
        error: "invalid_body"
      });
      return;
    }

    const allowed = new Set([
      "commandId", "date", "name"
    ]);

    if (Object.keys(body).some(key => !allowed.has(key))) {
      respond(context, 400, {
        ok: false,
        error: "unexpected_fields"
      });
      return;
    }

    const commandId = body.commandId;
    const date = body.date;
    const name = body.name;

    if (typeof commandId !== "string" ||
        typeof date !== "string" ||
        typeof name !== "string") {
      respond(context, 400, {
        ok: false,
        error: "invalid_body"
      });
      return;
    }

    const writer =
      dependencies.writer ?? createVisitorEventTableWriter();

    const result = await createVisitorEvent({
      commandId,
      date,
      name,
      actorId: auth.actorId
    }, writer);

    if (!result.accepted) {
      respond(context, result.status, {
        ok: false,
        error: result.error
      });
      return;
    }

    respond(context, result.replay ? 200 : 202, {
      ok: true,
      eventId: result.eventId,
      replay: result.replay
    });
  } catch {
    respond(context, 503, {
      ok: false,
      error: "event_creation_unavailable"
    });
  }
}