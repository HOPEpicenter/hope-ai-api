import { timingSafeEqual } from "node:crypto";
import { DateTime } from "luxon";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import { resolveSixWeekActorAuthorization } from "../_shared/sixWeekStaffActor";
import { recordVisitorArrival } from "../../services/visitors/recordVisitorArrival";
import { isVisitorCheckInRequest } from "../../services/visitors/recordVisitorCheckIn";
import {
  resolveVisitorEventContext,
  type VisitorEvent
} from "../../services/visitors/resolveVisitorEventContext";
import { listSundayCheckIns, reserveSundayCheckIn } from "../../services/visitors/sundayCheckInAccess";

type Request = {
  method?: string;
  body?: unknown;
  headers?: Record<string, unknown> | Headers;
  query?: { date?: unknown; eventId?: unknown };
};
type Context = { res?: { status: number; headers: Record<string, string>; body: unknown } };
type Dependencies = {
  now?: () => DateTime;
  record?: typeof recordVisitorArrival;
  reserve?: typeof reserveSundayCheckIn;
  list?: typeof listSundayCheckIns;
  approvedEvents?: () => Promise<readonly VisitorEvent[]>;
  authorizeStaff?: typeof resolveSixWeekActorAuthorization;
};

function reply(context: Context, status: number, body: unknown): void {
  context.res = {
    status, body,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  };
}

function authorizedBridge(req: Request): boolean {
  const expected = process.env.HOPE_VISITOR_CHECK_IN_BRIDGE_KEY ?? "";
  const actual = req.headers instanceof Headers
    ? req.headers.get("x-hope-check-in-key")
    : req.headers?.["x-hope-check-in-key"];
  if (typeof actual !== "string" || expected.length < 32 || actual.length !== expected.length) {
    return false;
  }
  const supplied = Buffer.from(actual);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export async function visitorSundayCheckIn(
  context: Context, req: Request, deps: Dependencies = {}
): Promise<void> {
  if (process.env.FEATURE_SUNDAY_VISITOR_CHECK_IN !== "true") {
    reply(context, 404, { status: "unavailable" });
    return;
  }

  const now = (deps.now ?? (() => DateTime.now()))().setZone("America/New_York");
  try {
    if (req.method === "GET") {
      const key = requireApiKeyForFunction(req);
      if (!key.ok) {
        reply(context, key.status, { status: "unavailable" });
        return;
      }
      const actor = await (deps.authorizeStaff ?? resolveSixWeekActorAuthorization)(req);
      if (!actor.ok) {
        reply(context, actor.status, { status: "unavailable" });
        return;
      }
      const date = req.query?.date ?? now.toISODate();
      if (typeof date !== "string" ||
          (req.query?.eventId !== undefined && typeof req.query.eventId !== "string")) {
        reply(context, 400, { status: "invalid" });
        return;
      }
      const event = resolveVisitorEventContext({
        date,
        selectedEventId: req.query?.eventId as string | undefined,
        approvedEvents: await (deps.approvedEvents ?? (async () => []))()
      });
      if (event.status !== "resolved") {
        reply(context, event.status === "selection_required" ? 409 : 400,
          { status: event.status });
        return;
      }
      reply(context, 200, {
        date,
        ...await (deps.list ?? listSundayCheckIns)(event.serviceId)
      });
      return;
    }

    if (req.method !== "POST") {
      reply(context, 405, { status: "unavailable" });
      return;
    }
    if (!authorizedBridge(req)) {
      reply(context, 401, { status: "unavailable" });
      return;
    }
    let serviceId = `${now.weekday === 7 ? "sunday" : "visit"}-${now.toISODate()}`;
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(key => !["name", "contactMethod", "contact", "submissionId", "eventId"].includes(key)) ||
        typeof body.name !== "string" || body.name.length > 160 ||
        typeof body.contact !== "string" || body.contact.length > 254 ||
        typeof body.submissionId !== "string" || !isVisitorCheckInRequest(body.submissionId, serviceId) ||
        (body.contactMethod !== "email" && body.contactMethod !== "phone")) {
      reply(context, 400, { status: "invalid" });
      return;
    }
    if (body.eventId !== undefined && typeof body.eventId !== "string") {
      reply(context, 400, { status: "invalid" });
      return;
    }
    const event = resolveVisitorEventContext({
      date: now.toISODate()!,
      selectedEventId: body.eventId as string | undefined,
      approvedEvents: await (deps.approvedEvents ?? (async () => []))()
    });
    if (event.status !== "resolved") {
      reply(context, event.status === "selection_required" ? 409 : 400,
        { status: event.status });
      return;
    }
    serviceId = event.serviceId;
    if (!await (deps.reserve ?? reserveSundayCheckIn)(now.toMillis())) {
      reply(context, 429, { status: "try_later" });
      return;
    }
    const result = await (deps.record ?? recordVisitorArrival)({
      submissionId: body.submissionId,
      serviceId,
      name: body.name,
      [body.contactMethod]: body.contact
    });
    if (result.status === "recorded") reply(context, 200, { status: "recorded" });
    else if (result.status === "invalid") reply(context, 400, { status: "invalid" });
    else reply(context, 409, { status: "ask_staff" });
  } catch {
    reply(context, 503, { status: "try_later" });
  }
}
