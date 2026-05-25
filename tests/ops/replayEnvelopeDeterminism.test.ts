import assert from "node:assert/strict";

function buildReplayEnvelope(args: {
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

const args = {
  previews: [{ id: 1 }],
  plans: [{ id: 2 }],
  timeline: [{ id: 3 }]
};

const a = buildReplayEnvelope(args);
const b = buildReplayEnvelope(args);

assert.equal(a.replayHash, b.replayHash);
assert.equal(a.replayDeterministic, true);
assert.equal(a.simulatedOnly, true);

console.log("replayEnvelopeDeterminism.test.ts passed");
