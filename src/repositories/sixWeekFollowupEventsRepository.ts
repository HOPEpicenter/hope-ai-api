import {
  isPublicVisitorConsentWithdrawal
} from "../domain/followups/projectSixWeekVisitorFollowup";

import { assertContactWriterNotHeld, contactWriterHoldEnabled } from "../services/followups/permanentVisitorContactWriterHold";
import type { TableClient } from "@azure/data-tables";
import type {
  SixWeekFollowupEvent,
  SixWeekFollowupEventType
} from "../domain/followups/projectSixWeekVisitorFollowup";
import { getTableClient } from "../storage/tableClient";

type SixWeekFollowupEventEntity = {
  partitionKey: string;
  rowKey: string;
  eventId: string;
  visitorId: string;
  type: SixWeekFollowupEventType;
  occurredAt: string;
  actorId: string;
  dataJson: string;
};

const TABLE_NAME = "VisitorFollowupEvents";

function rowKeyFor(event: SixWeekFollowupEvent): string {
  // One durable public-consent closure per visitor plan.
  // Exact retries and concurrent withdrawals cannot
  // create multiple closure records.
  if (isPublicVisitorConsentWithdrawal(event)) {
    return "0001__public-consent-withdrawn";
  }

  if (event.type === "six_week_followup.plan_started") {
    return "0000__plan-started";
  }

  if (
    event.type === "six_week_followup.task_completed" ||
    event.type === "six_week_followup.task_skipped"
  ) {
    const week = String(event.data.weekNumber ?? 0).padStart(2, "0");
    return `1000__task-${week}-outcome`;
  }

  return `${event.occurredAt}__${event.eventId}`;
}

export function toSixWeekFollowupEventEntity(
  event: SixWeekFollowupEvent
): SixWeekFollowupEventEntity {
  return {
    partitionKey: event.visitorId,
    rowKey: rowKeyFor(event),
    eventId: event.eventId,
    visitorId: event.visitorId,
    type: event.type,
    occurredAt: event.occurredAt,
    actorId: event.actorId,
    dataJson: JSON.stringify(event.data)
  };
}

export function fromEntity(
  entity: SixWeekFollowupEventEntity
): SixWeekFollowupEvent {
  return {
    eventId: entity.eventId,
    visitorId: entity.visitorId,
    type: entity.type,
    occurredAt: entity.occurredAt,
    actorId: entity.actorId,
    data: JSON.parse(entity.dataJson || "{}")
  };
}

function isConflict(error: any): boolean {
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  const code = String(error?.code ?? "");

  return status === 409 || code === "EntityAlreadyExists";
}

export class SixWeekFollowupEventsRepository {
  constructor(
    private readonly isolatedTable?: TableClient
  ) {}

  private async tableFor(): Promise<TableClient> {
    return this.isolatedTable ??
      await getTableClient(TABLE_NAME);
  }

  /**
   * Trusted Staff command boundary.
   * Ordinary append remains subject to the existing writer hold.
   */
  async startConsentProtectedPlan(
    event: SixWeekFollowupEvent
  ): Promise<"created" | "conflict" | "blocked" | "unavailable"> {
    if (!contactWriterHoldEnabled()) return "unavailable";

    const table = await this.tableFor();

    const { createPermanentVisitorConsentRepository } =
      await import("./permanentVisitorConsentRepository");

    return createPermanentVisitorConsentRepository(
      table, true
    ).appendStaffEnrollment(event);
  }

  async claimConsentProtectedOwner(
    event: SixWeekFollowupEvent
  ): Promise<"claimed" | "conflict" | "blocked" | "unavailable"> {
    if (!contactWriterHoldEnabled()) return "unavailable";

    const table = await this.tableFor();

    const { createPermanentVisitorConsentRepository } =
      await import("./permanentVisitorConsentRepository");

    return createPermanentVisitorConsentRepository(
      table, true
    ).appendStaffOwnerClaim(event);
  }

  async resumeConsentProtectedPlan(
    event: SixWeekFollowupEvent
  ): Promise<"recorded" | "conflict" | "blocked" | "unavailable"> {
    if (!contactWriterHoldEnabled()) return "unavailable";

    const table = await this.tableFor();

    const { createPermanentVisitorConsentRepository } =
      await import("./permanentVisitorConsentRepository");

    return createPermanentVisitorConsentRepository(
      table, true
    ).appendStaffPlanResume(event);
  }

  async recordConsentProtectedTaskOutcome(
    event: SixWeekFollowupEvent
  ): Promise<"recorded" | "conflict" | "blocked" | "unavailable"> {
    if (!contactWriterHoldEnabled()) return "unavailable";

    const table = await this.tableFor();

    const { createPermanentVisitorConsentRepository } =
      await import("./permanentVisitorConsentRepository");

    return createPermanentVisitorConsentRepository(
      table, true
    ).appendStaffTaskOutcome(event);
  }

  async append(event: SixWeekFollowupEvent): Promise<boolean> {
    assertContactWriterNotHeld("six_week", event.type, event.data);
    const table: TableClient = await this.tableFor();

    try {
      if (contactWriterHoldEnabled()) {
        // Restrictive operations remain available, but must
        // coordinate with any concurrent authorized owner claim.
        const start = await table.getEntity<SixWeekFollowupEventEntity>(
          event.visitorId, "0000__plan-started"
        );

        if (typeof start.etag !== "string" ||
            !start.etag ||
            start.etag === "*" ||
            start.type !== "six_week_followup.plan_started" ||
            start.visitorId !== event.visitorId) {
          throw new Error("Canonical plan checkpoint unavailable");
        }

        await table.submitTransaction([
          ["update", toSixWeekFollowupEventEntity(fromEntity(start)),
            "Replace", { etag: start.etag }],
          ["create", toSixWeekFollowupEventEntity(event)]
        ]);
      } else {
        await table.createEntity(
          toSixWeekFollowupEventEntity(event)
        );
      }

      return true;
    } catch (error: any) {
      if (isConflict(error)) return false;
      throw error;
    }
  }

  async listByVisitor(visitorId: string): Promise<SixWeekFollowupEvent[]> {
    const table: TableClient = await this.tableFor();
    const events: SixWeekFollowupEvent[] = [];
    const escaped = visitorId.replace(/'/g, "''");
    const filter = `PartitionKey eq '${escaped}'`;

    for await (const entity of table.listEntities<SixWeekFollowupEventEntity>({
      queryOptions: { filter }
    })) {
      if (entity.rowKey?.startsWith("consent-v1:")) continue;
      events.push(fromEntity(entity));
    }

    return events;
  }

  async listAll(): Promise<SixWeekFollowupEvent[]> {
    const table: TableClient = await this.tableFor();
    const events: SixWeekFollowupEvent[] = [];

    for await (const entity of table.listEntities<SixWeekFollowupEventEntity>()) {
      if (entity.rowKey?.startsWith("consent-v1:")) continue;
      events.push(fromEntity(entity));
    }

    return events;
  }
}
