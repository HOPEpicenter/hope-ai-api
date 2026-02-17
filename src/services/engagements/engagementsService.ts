import { EngagementEventEnvelopeV1, validateEngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";
import { normalizeEngagementEventEnvelopeV1 } from "../../domain/engagement/normalizeEngagementEventEnvelopeV1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { deriveEngagementStatusFromEvents } from "../../domain/engagement/deriveEngagementStatus.v1";

export class EngagementsService {
  constructor(private repo: EngagementEventsRepository) {}

  async appendEvent(raw: unknown, opts?: { idempotencyKey?: string }): Promise<void> {
    const validated = validateEngagementEventEnvelopeV1(raw);
    if (!validated.ok) {
      const err: any = new Error("Validation failed");
      err.statusCode = 400;
      err.details = validated.issues;
      throw err;
    }

    const evt = validated.value;
    const normalized = normalizeEngagementEventEnvelopeV1(evt as EngagementEventEnvelopeV1);
    await this.repo.appendEvent(normalized, opts);
  }
  async getAnalytics(visitorId: string): Promise<import("../../contracts/engagementAnalytics.v1").EngagementAnalyticsV1> {
    const MAX_EVENTS = 2000;
    const PAGE_SIZE = 250;

    // Pull current status (source of truth)
    const current = await this.getCurrentStatus(visitorId);
    const currentStatus = (current.status ?? null) as string | null;

    // Page through timeline
    const all: any[] = [];
    let cursor: string | undefined = undefined;

    while (all.length < MAX_EVENTS) {
      const page = await this.readTimeline(visitorId, PAGE_SIZE, cursor);
      all.push(...page.items);

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    const transitions = all
      .filter((e) => e && e.type === "status.transition")
      .map((e) => ({
        occurredAt: typeof e.occurredAt === "string" ? e.occurredAt : null,
        to: typeof e.data?.to === "string" ? String(e.data.to) : null,
        from: typeof e.data?.from === "string" ? String(e.data.from) : null,
      }))
      .filter((t) => !!t.occurredAt && !!t.to) as { occurredAt: string; to: string; from: string | null }[];

    let engagedCount = 0;
    let disengagedCount = 0;

    for (const t of transitions) {
      const toNorm = t.to.trim().toLowerCase();
      if (toNorm === "engaged") engagedCount++;
      if (toNorm === "disengaged") disengagedCount++;
    }

    const firstEngagedAt =
      transitions.find((t) => t.to.trim().toLowerCase() === "engaged")?.occurredAt ?? null;

    const lastTransitionAt = transitions.length > 0 ? transitions[transitions.length - 1].occurredAt : null;

    // Find when current status began (scan from the end)
    let currentStatusSince: string | null = null;
    if (currentStatus) {
      const curNorm = currentStatus.trim().toLowerCase();
      for (let i = transitions.length - 1; i >= 0; i--) {
        if (transitions[i].to.trim().toLowerCase() === curNorm) {
          currentStatusSince = transitions[i].occurredAt;
          break;
        }
      }
    }

    return {
      v: 1,
      visitorId,
      currentStatus,
      currentStatusSince,
      transitions: {
        total: transitions.length,
        engaged: engagedCount,
        disengaged: disengagedCount,
      },
      firstEngagedAt,
      lastTransitionAt,
    };
  }


  async readTimeline(visitorId: string, limit: number, cursor?: string) {
    return this.repo.readTimeline(visitorId, limit, cursor);
  }

  /**
   * Status v1 is derived from status.transition events (auditable/derivable).
   * Minimal implementation: read up to 200 events and derive.
   */
  async getCurrentStatus(visitorId: string) {
    const page = await this.repo.readTimeline(visitorId, 200, undefined);

    // Repo returns ascending RowKey order (oldest -> newest).
    const events = page.items;

    return deriveEngagementStatusFromEvents(visitorId, events);
  }
}




