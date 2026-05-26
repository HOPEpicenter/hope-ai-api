export function buildReplayEnvelope(args: {
  previews: any[];
  plans: any[];
  timeline: any[];
}) {
  const canonical =
    JSON.stringify({
      previews: args.previews,
      plans: args.plans,
      timeline: args.timeline
    });

  return {
    replayVersion: 1,
    replayDeterministic: true,
    replayHash:
      Buffer.from(canonical)
        .toString("base64")
        .slice(0, 32),
    simulatedOnly: true
  };
}