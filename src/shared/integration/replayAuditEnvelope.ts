import {
  buildReplayDiagnosticsEnvelope
} from "./replayDiagnosticsEnvelope";

import {
  classifyReplayDriftSeverity
} from "./replayDriftSeverity";

export function buildReplayAuditEnvelope(args: {
  visitorId?: string;
  eventCount?: number;
  drifted?: boolean;
  repaired?: boolean;
  driftFields?: unknown[];
}) {
  const driftFields =
    Array.isArray(args.driftFields)
      ? args.driftFields
      : [];

  return {
    visitorId: args.visitorId ?? null,
    drifted: Boolean(args.drifted),
    repaired: Boolean(args.repaired),
    driftSeverity:
      classifyReplayDriftSeverity({
        drifted: args.drifted,
        repaired: args.repaired,
        driftFieldCount: driftFields.length
      }),
    driftFieldCount: driftFields.length,
    ...buildReplayDiagnosticsEnvelope({
      eventCount: args.eventCount,
      drifted: args.drifted,
      repaired: args.repaired
    })
  };
}
