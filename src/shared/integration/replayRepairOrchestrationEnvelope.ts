import {
  classifyReplayLagSeverity
} from "./replayLagSeverity";

export function buildReplayRepairOrchestrationEnvelope(args: {
  scanned?: number;
  drifted?: number;
  repaired?: number;
  failed?: number;
  lagMs?: number | null;
  nextCursor?: string | null;
}) {
  return {
    replayRepair: {
      deterministicReplay: true,
      scanned: Number(args.scanned ?? 0),
      drifted: Number(args.drifted ?? 0),
      repaired: Number(args.repaired ?? 0),
      failed: Number(args.failed ?? 0),
      lagMs: args.lagMs ?? null,
      lagSeverity:
        classifyReplayLagSeverity(args.lagMs),
      nextCursor:
        args.nextCursor ?? null
    }
  };
}
