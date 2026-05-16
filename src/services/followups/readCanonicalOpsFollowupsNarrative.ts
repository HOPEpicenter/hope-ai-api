import { readOpsFollowupsQueue } from "./readOpsFollowupsQueue";
import type { ReadOpsFollowupsQueueOptions } from "./readOpsFollowupsQueue";
import type { OpsFollowupsQueueResult } from "./opsFollowupsQueueContracts";

export type ReadCanonicalOpsFollowupsNarrativeOptions = ReadOpsFollowupsQueueOptions;

export async function readCanonicalOpsFollowupsNarrative(
  opts: ReadCanonicalOpsFollowupsNarrativeOptions
): Promise<OpsFollowupsQueueResult> {
  return readOpsFollowupsQueue(opts);
}