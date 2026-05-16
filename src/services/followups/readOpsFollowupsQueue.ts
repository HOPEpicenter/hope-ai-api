import { TableClient } from "@azure/data-tables";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../engagements/engagementsService";
import { buildOpsFollowupsQueue } from "./buildOpsFollowupsQueue";
import type { OpsFollowupsQueueResult } from "./opsFollowupsQueueContracts";

export type ReadOpsFollowupsQueueOptions = {
  eventsTable: TableClient;
  profilesTable: TableClient;
  limit: number;
  cursor: number;
  assignedToFilter?: string;
  visitorIdFilter?: string;
  includeResolved: boolean;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export async function readOpsFollowupsQueue(
  opts: ReadOpsFollowupsQueueOptions
): Promise<OpsFollowupsQueueResult> {
  const engagementService = new EngagementsService(new EngagementEventsRepository());

  return buildOpsFollowupsQueue({
    ...opts,
    engagementService
  });
}