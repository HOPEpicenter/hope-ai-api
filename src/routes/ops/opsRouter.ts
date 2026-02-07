import { Router } from "express";
import type { VisitorsRepository } from "../../repositories/visitorsRepository";
import type {
  FormationEventsRepository,
  FormationEventType,
} from "../../repositories/formationEventsRepository";
import { createEngagementsRouter } from "./engagements/engagementsRouter";
import { badRequest, notFound } from "../../http/apiError";
import {
  parseCreateVisitorBody,
  parseAppendEventBody,
  parseVisitorId,
  parseLimit,
  parseCursor,
} from "../../http/opsValidation";
const allowedTypes: FormationEventType[] = [
  "note",
  "message",
  "call",
  "visit",
  "prayer",
  "follow_up",
  "other",
];
import type { EngagementsRepository } from "../../repositories/engagementsRepository";
function isAllowedType(v: unknown): v is FormationEventType {
  return typeof v === "string" && (allowedTypes as string[]).includes(v);
}

function isMetadataTooLargeError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "");
  return msg.toLowerCase().startsWith("metadata too large:");
}

function getRequestId(req: any): string | undefined {
  const rid = req?.requestId;
  return typeof rid === "string" && rid.length > 0 ? rid : undefined;
}

export function createOpsRouter(visitorsRepository: VisitorsRepository, formationEventsRepository: FormationEventsRepository, engagementsRepository: EngagementsRepository): Router {
  const opsRouter = Router();

  opsRouter.use("/engagements", createEngagementsRouter(engagementsRepository));

  opsRouter.get("/health", (req, res) => {
    res.json({ ok: true, requestId: getRequestId(req) });
  });

  opsRouter.post("/visitors", async (req, res) => {
    const body = parseCreateVisitorBody(req.body);

    const visitor = await visitorsRepository.create({
      name: body.name,
      email: body.email,
    });

    res.status(201).json({
      requestId: getRequestId(req),
      visitorId: visitor.visitor.visitorId,
      visitor,
    });
  });

  opsRouter.post("/visitors/:vid/events", async (req, res) => {
    const { visitorId } = parseVisitorId(req.params);

    const visitor = await visitorsRepository.getById(visitorId);
    if (!visitor) {
      throw notFound("Visitor not found.", { visitorId });
    }

    const body = parseAppendEventBody(req.body);
    const type = body.type;

    if (!isAllowedType(type)) {
      throw badRequest("Invalid or missing 'type'.", {
        allowedTypes,
        receivedType: type,
      });
    }

    const occurredAtRaw = body.occurredAt ?? new Date().toISOString();
    const t = Date.parse(occurredAtRaw);
    if (!Number.isFinite(t)) {
      throw badRequest("Invalid 'occurredAt' (must be ISO8601 string).", {
        occurredAt: occurredAtRaw,
      });
    }

    const summary = body.summary;

    let metadata: Record<string, unknown> | undefined = undefined;
    if (body.metadata !== undefined) {
      if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
        metadata = body.metadata as Record<string, unknown>;
      } else {
        throw badRequest("Invalid 'metadata' (must be an object).");
      }
    }

    try {
      const created = await formationEventsRepository.append({
        visitorId,
        type,
        occurredAt: new Date(t).toISOString(),
        summary,
        metadata,
      });

      res.status(201).json({
        requestId: getRequestId(req),
        visitorId,
        event: created,
      });
    } catch (err) {
      if (isMetadataTooLargeError(err)) {
        throw badRequest("metadata too large (reduce metadata fields/size).", {
          reason: String((err as any)?.message ?? err),
        });
      }
      throw err;
    }
  });

  opsRouter.get("/visitors/:vid/dashboard", async (req, res) => {
    const { visitorId } = parseVisitorId(req.params);

    const visitor = await visitorsRepository.getById(visitorId);
    if (!visitor) {
      throw notFound("Visitor not found.", { visitorId });
    }

    // Keep legacy behavior: default=20
    const limit = parseLimit(req.query, 20);
    const cursor = parseCursor(req.query);

    const timeline = await formationEventsRepository.listByVisitor({
      visitorId,
      limit,
      cursor: cursor ?? undefined,
    });

    res.json({
      requestId: getRequestId(req),
      visitorId,
      visitor,
      timeline: {
        limit,
        cursor,
        nextCursor: timeline.nextCursor,
        items: timeline.items,
      },
    });
  });

  opsRouter.get("/visitors/:vid/timeline", async (req, res) => {
    const { visitorId } = parseVisitorId(req.params);

    const visitor = await visitorsRepository.getById(visitorId);
    if (!visitor) {
      throw notFound("Visitor not found.", { visitorId });
    }

    // Keep legacy behavior: default=50
    const limit = parseLimit(req.query, 50);
    const cursor = parseCursor(req.query);

    const page = await formationEventsRepository.listByVisitor({
      visitorId,
      limit,
      cursor: cursor ?? undefined,
    });

    res.json({
      requestId: getRequestId(req),
      visitorId,
      limit,
      cursor,
      nextCursor: page.nextCursor,
      items: page.items,
    });
  });

  opsRouter.post("/populate-dummy", async (req, res) => {
    const visitor = await visitorsRepository.create({
      name: `Dummy Visitor ${new Date().toISOString()}`,
      email: `dummy+${Date.now()}@example.com`,
    });

    const now = Date.now();
    const samples = [
      { type: "note" as const, minutesAgo: 0, summary: "Created dummy visitor" },
      { type: "message" as const, minutesAgo: 10, summary: "Sent welcome message" },
      { type: "call" as const, minutesAgo: 60, summary: "Intro call completed" },
      { type: "visit" as const, minutesAgo: 60 * 24, summary: "First visit" },
      { type: "follow_up" as const, minutesAgo: 60 * 24 * 3, summary: "Follow-up scheduled" },
    ];

    for (const s of samples) {
      await formationEventsRepository.append({
        visitorId: visitor.visitor.visitorId,
        type: s.type,
        occurredAt: new Date(now - s.minutesAgo * 60_000).toISOString(),
        summary: s.summary,
        metadata: { dummy: true, minutesAgo: s.minutesAgo },
      });
    }

    res.status(201).json({
      requestId: getRequestId(req),
      visitorId: visitor.visitor.visitorId,
      visitor,
      inserted: samples.length,
    });
  });

  return opsRouter;
}



