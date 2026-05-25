import assert from "node:assert/strict";

function computeLag(
  latestEventAt: string | null,
  profileLastEventAt: string | null
) {
  const latestEventTime = latestEventAt
    ? Date.parse(latestEventAt)
    : NaN;

  const profileLastEventTime = profileLastEventAt
    ? Date.parse(profileLastEventAt)
    : NaN;

  const profileBehind =
    Number.isFinite(latestEventTime) && (
      !Number.isFinite(profileLastEventTime) ||
      profileLastEventTime < latestEventTime
    );

  const lagMs =
    profileBehind && Number.isFinite(latestEventTime)
      ? latestEventTime - (
          Number.isFinite(profileLastEventTime)
            ? profileLastEventTime
            : 0
        )
      : null;

  return {
    profileBehind,
    lagMs
  };
}

const result = computeLag(
  "2026-01-03T00:00:00Z",
  "2026-01-01T00:00:00Z"
);

assert.equal(result.profileBehind, true);
assert.equal(result.lagMs, 172800000);

const aligned = computeLag(
  "2026-01-03T00:00:00Z",
  "2026-01-03T00:00:00Z"
);

assert.equal(aligned.profileBehind, false);
assert.equal(aligned.lagMs, null);

console.log("replayLagDetection.test.ts passed");
