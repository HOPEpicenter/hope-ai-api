import {
  updateVisitorEvent,
  type VisitorEventUpdateRepository
} from "../../services/visitors/updateVisitorEvent";
import {
  createVisitorEventUpdateRepository
} from "../../services/visitors/visitorEventUpdateRepository";
import {
  requireAdminStaffActorForFunction,
  type RequiredAdminStaffActor
} from "../_shared/adminStaffActor";

type Dependencies = {
  authorize?: (request: any) => Promise<RequiredAdminStaffActor>;
  repository?: VisitorEventUpdateRepository;
};

function reply(
  context: any,
  status: number,
  body: Record<string, unknown>
): void {
  context.res = { status, body };
}

/**
 * Internal administrator-only event update handler.
 *
 * NOT registered as an Azure Function.
 * Authentication precedes any repository construction or access.
 * No public visitor endpoint can invoke this handler.
 */
export async function patchVisitorEvent(
  context: any,
  req: any,
  dependencies: Dependencies = {}
): Promise<void> {
  try {
    const authorize =
      dependencies.authorize ?? requireAdminStaffActorForFunction;

    const auth = await authorize(req);

    if (!auth.ok) {
      reply(context, auth.status, auth.body);
      return;
    }

    if (req?.method !== "PATCH") {
      reply(context, 405, {
        ok: false,
        error: "method_not_allowed"
      });
      return;
    }

    const body = req?.body;

    if (!body ||
        typeof body !== "object" ||
        Array.isArray(body)) {
      reply(context, 400, {
        ok: false,
        error: "invalid_body"
      });
      return;
    }

    const allowed = new Set([
      "commandId",
      "eventId",
      "date",
      "name",
      "active"
    ]);

    if (Object.keys(body).some(key => !allowed.has(key))) {
      reply(context, 400, {
        ok: false,
        error: "unexpected_fields"
      });
      return;
    }

    if (
      typeof body.commandId !== "string" ||
      typeof body.eventId !== "string" ||
      (body.date !== undefined &&
       typeof body.date !== "string") ||
      (body.name !== undefined &&
       typeof body.name !== "string") ||
      (body.active !== undefined &&
       typeof body.active !== "boolean")
    ) {
      reply(context, 400, {
        ok: false,
        error: "invalid_body"
      });
      return;
    }

    const repository = dependencies.repository ??
      createVisitorEventUpdateRepository();

    const result = await updateVisitorEvent({
      commandId: body.commandId,
      actorId: auth.actorId,
      eventId: body.eventId,
      date: body.date,
      name: body.name,
      active: body.active
    }, repository);

    if (!result.accepted) {
      reply(context, result.status, {
        ok: false,
        error: result.error
      });
      return;
    }

    reply(context, result.replay ? 200 : 202, {
      ok: true,
      eventId: result.eventId,
      active: result.active,
      replay: result.replay
    });
  } catch {
    reply(context, 503, {
      ok: false,
      error: "event_update_unavailable"
    });
  }
}