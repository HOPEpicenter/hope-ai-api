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
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
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

  const integrationService = new IntegrationService(new EngagementEventsRepository());

  opsRouter.use("/engagements", createEngagementsRouter(engagementsRepository));

  opsRouter.get("/health", (req, res) => {
    res.json({ ok: true, requestId: getRequestId(req) });
  });

  opsRouter.post("/visitors", async (req, res) => {
  // GET /ops/visitors (list)
  opsRouter.get("/visitors", async (req, res) => {
    const limit = parseLimit(req.query, 5);

    const page = await visitorsRepository.list({
      limit,
    });

    res.json({
      requestId: getRequestId(req),
      limit,
      count: page.count,
      items: page.items,
    });
  });

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

  opsRouter.get("/visitors/:vid", async (req, res) => {
    const { visitorId } = parseVisitorId(req.params);

    const visitor = await visitorsRepository.getById(visitorId);
    if (!visitor) {
      throw notFound("Visitor not found.", { visitorId });
    }

    res.json({
      requestId: getRequestId(req),
      visitorId,
      visitor,
    });
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

  
  /**
   * GET /api/ops/visitors/:vid/dashboard-card
   *
   * Minimal UI-ready visitor card (formation-based surface).
   */
  opsRouter.get("/visitors/:vid/dashboard-card", async (req, res) => {
    const { visitorId } = parseVisitorId(req.params);

    const visitor = await visitorsRepository.getById(visitorId);
    if (!visitor) {
      throw notFound("Visitor not found.", { visitorId });
    }

    const page = await integrationService.readIntegratedTimeline(visitorId, 100);

    const latest = Array.isArray(page.items) && page.items.length > 0
      ? page.items[0]
      : null;

    const derivedTags = Array.isArray(page.items)
      ? (() => {
          const acc = new Map<string, boolean>();

          for (const item of page.items.slice().reverse()) {
            const tag =
              typeof item?.data?.tag === "string"
                ? item.data.tag.trim()
                : typeof item?.data?.name === "string"
                  ? item.data.name.trim()
                  : "";

            if (!tag) continue;

            if (item.type === "TAG_ADDED") {
              acc.set(tag, true);
            } else if (item.type === "TAG_REMOVED") {
              acc.delete(tag);
            }
          }

          return Array.from(acc.keys()).sort((a, b) => a.localeCompare(b));
        })()
      : [];

    const assignedTo = Array.isArray(page.items)
      ? (() => {
          for (const item of page.items) {
            if (item?.type === "FOLLOWUP_ASSIGNED") {
              const id =
                typeof item?.data?.assigneeId === "string"
                  ? item.data.assigneeId.trim()
                  : "";
              if (id) return id;
            }

            if (item?.type === "FOLLOWUP_UNASSIGNED") {
              return null;
            }
          }
          return null;
        })()
      : null;

    const followupStatus =
      latest?.type === "FOLLOWUP_OUTCOME_RECORDED"
        ? "resolved"
        : latest?.type === "FOLLOWUP_CONTACTED" || latest?.type === "CONTACT_CALL" || latest?.type === "CONTACT_TEXT" || latest?.type === "CONTACT_MEETING"
          ? "contacted"
          : latest?.type === "FOLLOWUP_ASSIGNED" || latest?.type === "FOLLOWUP_UNASSIGNED" || latest?.type === "follow_up"
            ? "pending"
            : "none";

    const attentionState =
      followupStatus === "resolved" || followupStatus === "contacted"
        ? "clear"
        : "needs_attention";

    const lastFollowupAssignedAt = Array.isArray(page.items)
      ? (() => {
          for (const item of page.items) {
            if (item?.type === "FOLLOWUP_ASSIGNED") {
              const at =
                typeof item?.occurredAt === "string" && item.occurredAt.trim().length > 0
                  ? item.occurredAt.trim()
                  : null;
              if (at) return at;
            }

            if (item?.type === "FOLLOWUP_UNASSIGNED") {
              return null;
            }
          }
          return null;
        })()
      : null;

    function getAgeHours(value: string | null): number | null {
      if (!value) return null;
      const assignedMs = new Date(value).getTime();
      if (Number.isNaN(assignedMs)) return null;

      const diffMs = Date.now() - assignedMs;
      if (diffMs < 0) return 0;

      return Math.floor(diffMs / (1000 * 60 * 60));
    }

    const ageHours = getAgeHours(lastFollowupAssignedAt);

    const followupUrgency =
      !assignedTo || followupStatus === "resolved" || followupStatus === "contacted"
        ? null
        : ageHours !== null && ageHours >= 48
          ? "OVERDUE"
          : ageHours !== null && ageHours >= 24
            ? "AT_RISK"
            : "ON_TRACK";

    const followupOverdue = followupUrgency === "OVERDUE";
    return res.json({
      requestId: getRequestId(req),
      visitorId,
      card: {
        visitorId,
        name: visitor.name ?? null,
        email: visitor.email ?? null,
        lastActivityAt: latest?.occurredAt ?? null,
        lastActivitySummary: latest?.summary ?? null,
        followupStatus,
        assignedTo,
        attentionState,
        followupUrgency,
        followupOverdue,
        tags: derivedTags,
      },
    });
  });

  return opsRouter;
}

