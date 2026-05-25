import assert from "node:assert/strict";
import {
  compareEventOrder,
  shouldAdvanceEventState,
  shouldAdvanceTouchpointAt
} from "../../src/functions/_shared/reconciliation";

assert.equal(
  compareEventOrder(
    "2026-01-01T00:00:00Z",
    "evt-a",
    "2026-01-02T00:00:00Z",
    "evt-b"
  ) < 0,
  true,
  "older events should compare lower"
);

assert.equal(
  compareEventOrder(
    "2026-01-02T00:00:00Z",
    "evt-b",
    "2026-01-01T00:00:00Z",
    "evt-a"
  ) > 0,
  true,
  "newer events should compare higher"
);

assert.equal(
  compareEventOrder(
    "2026-01-01T00:00:00Z",
    "evt-a",
    "2026-01-01T00:00:00Z",
    "evt-b"
  ) < 0,
  true,
  "eventId should deterministically break timestamp ties"
);

assert.equal(
  shouldAdvanceEventState(
    "2026-01-03T00:00:00Z",
    "evt-3",
    "2026-01-02T00:00:00Z",
    "evt-2"
  ),
  true
);

assert.equal(
  shouldAdvanceEventState(
    "2026-01-01T00:00:00Z",
    "evt-1",
    "2026-01-02T00:00:00Z",
    "evt-2"
  ),
  false,
  "older delayed events must not overwrite newer projections"
);

assert.equal(
  shouldAdvanceTouchpointAt(
    "2026-01-02T00:00:00Z",
    "2026-01-03T00:00:00Z"
  ),
  true
);

assert.equal(
  shouldAdvanceTouchpointAt(
    "2026-01-03T00:00:00Z",
    "2026-01-02T00:00:00Z"
  ),
  false,
  "older touchpoints must not overwrite newer timestamps"
);

console.log("reconciliation.test.ts passed");
