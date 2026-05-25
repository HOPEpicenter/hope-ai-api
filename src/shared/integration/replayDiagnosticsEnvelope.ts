export type ReplayDiagnosticsEnvelope = {
  replayDiagnostics: {
    replayVersion: 1;
    deterministicReplay: true;
    eventCount?: number;
    drifted?: boolean | null;
    repaired?: boolean | null;
    profileBehind?: boolean | null;
    lagMs?: number | null;
    latestEventAt?: string | null;
    profileLastEventAt?: string | null;
  };
};

export function buildReplayDiagnosticsEnvelope(args: {
  eventCount?: number;
  drifted?: boolean | null;
  repaired?: boolean | null;
  profileBehind?: boolean | null;
  lagMs?: number | null;
  latestEventAt?: string | null;
  profileLastEventAt?: string | null;
}): ReplayDiagnosticsEnvelope {
  return {
    replayDiagnostics: {
      replayVersion: 1,
      deterministicReplay: true,
      eventCount: args.eventCount,
      drifted: args.drifted ?? null,
      repaired: args.repaired ?? null,
      profileBehind: args.profileBehind ?? null,
      lagMs: args.lagMs ?? null,
      latestEventAt: args.latestEventAt ?? null,
      profileLastEventAt: args.profileLastEventAt ?? null
    }
  };
}
