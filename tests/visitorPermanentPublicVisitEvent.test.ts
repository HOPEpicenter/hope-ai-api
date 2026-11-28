import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  resolvePermanentPublicVisitEvent as resolve,
  type PermanentPublicVisitContext
} from "../src/services/visitors/resolvePermanentPublicVisitEvent";

const sunday = {
  id: "synthetic-sunday-worship",
  date: "2026-11-29",
  name: "Sunday Worship",
  active: true
};

const wednesday = {
  id: "synthetic-wednesday-study",
  date: "2026-11-25",
  name: "Wednesday Bible Study",
  active: true
};

const special = {
  id: "synthetic-special-event",
  date: "2026-11-24",
  name: "Special Ministry Event",
  active: true
};

const base: PermanentPublicVisitContext = {
  enabled: true,
  nowMs: Date.parse("2026-11-29T15:00:00Z"),
  approvedEvents: [sunday, wednesday, special]
};

test("deployment remains disabled by default", () => {
  assert.deepEqual(
    resolve({
      ...base,
      enabled: undefined
    }),
    { status: "disabled" }
  );

  assert.deepEqual(
    resolve({
      ...base,
      enabled: false
    }),
    { status: "disabled" }
  );
});

test("Sunday admission requires no owner activation", () => {
  assert.deepEqual(resolve(base), {
    status: "ready",
    kind: "scheduled",
    date: sunday.date,
    serviceId: sunday.id,
    name: sunday.name
  });
});

test("weekday services open automatically", () => {
  assert.deepEqual(resolve({
    ...base,
    nowMs: Date.parse("2026-11-25T23:00:00Z")
  }), {
    status: "ready",
    kind: "scheduled",
    date: wednesday.date,
    serviceId: wednesday.id,
    name: wednesday.name
  });
});

test("special events require no manual activation", () => {
  assert.deepEqual(resolve({
    ...base,
    nowMs: Date.parse("2026-11-24T20:00:00Z")
  }), {
    status: "ready",
    kind: "scheduled",
    date: special.date,
    serviceId: special.id,
    name: special.name
  });
});

test("unscheduled Sunday and weekday visits are accepted", () => {
  assert.deepEqual(resolve({
    ...base,
    approvedEvents: []
  }), {
    status: "ready",
    kind: "general",
    date: "2026-11-29",
    serviceId: "sunday-2026-11-29",
    name: "General Visit"
  });

  assert.deepEqual(resolve({
    ...base,
    nowMs: Date.parse("2026-11-26T17:00:00Z")
  }), {
    status: "ready",
    kind: "general",
    date: "2026-11-26",
    serviceId: "visit-2026-11-26",
    name: "General Visit"
  });
});

const evening = {
  ...sunday,
  id: "synthetic-evening-service",
  name: "Evening Service"
};

test("multiple events require an explicit selection", () => {
  assert.deepEqual(resolve({
    ...base,
    approvedEvents: [sunday, evening, wednesday]
  }), {
    status: "selection_required",
    date: sunday.date,
    events: [
      {
        serviceId: sunday.id,
        name: sunday.name
      },
      {
        serviceId: evening.id,
        name: evening.name
      }
    ]
  });
});

test("a valid same-day event selection is accepted", () => {
  assert.deepEqual(resolve({
    ...base,
    approvedEvents: [sunday, evening],
    selectedEventId: evening.id
  }), {
    status: "ready",
    kind: "scheduled",
    date: evening.date,
    serviceId: evening.id,
    name: evening.name
  });
});

test("browser-selected unknown or wrong-day events are denied", () => {
  for (const selectedEventId of [
    "unapproved-event",
    wednesday.id,
    "sunday-2026-11-29",
    "",
    null,
    123
  ]) {
    assert.deepEqual(resolve({
      ...base,
      selectedEventId
    }), {
      status: "invalid_selection"
    });
  }
});

test("inactive events do not prevent a General Visit", () => {
  const inactive = {
    ...sunday,
    active: false
  };

  const context = {
    ...base,
    approvedEvents: [inactive]
  };

  assert.deepEqual(resolve(context), {
    status: "ready",
    kind: "general",
    date: sunday.date,
    serviceId: "sunday-2026-11-29",
    name: "General Visit"
  });

  assert.deepEqual(resolve({
    ...context,
    selectedEventId: inactive.id
  }), {
    status: "invalid_selection"
  });
});

test("Eastern date boundaries work in winter and summer", () => {
  const cases = [
    ["2026-11-24T04:59:59Z", "2026-11-23"],
    ["2026-11-24T05:00:00Z", "2026-11-24"],
    ["2026-07-04T03:59:59Z", "2026-07-03"],
    ["2026-07-04T04:00:00Z", "2026-07-04"]
  ];

  for (const [timestamp, expectedDate] of cases) {
    const result = resolve({
      enabled: true,
      nowMs: Date.parse(timestamp),
      approvedEvents: []
    });

    assert.equal(result.status, "ready");

    if (result.status === "ready") {
      assert.equal(result.date, expectedDate);
    }
  }
});

test("ambiguous or malformed event data fails closed", () => {
  const snapshots = [
    [sunday, { ...sunday }],
    [{ ...sunday, date: "2026-02-30" }],
    [{ ...sunday, id: "" }],
    [{ ...sunday, name: "" }]
  ];

  for (const approvedEvents of snapshots) {
    assert.deepEqual(resolve({
      ...base,
      approvedEvents
    }), {
      status: "unavailable"
    });
  }
});

test("unknown schedule or invalid server time cannot authorize admission", () => {
  assert.deepEqual(resolve({
    ...base,
    approvedEvents: undefined as unknown as
      PermanentPublicVisitContext["approvedEvents"]
  }), {
    status: "unavailable"
  });

  for (const nowMs of [
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER
  ]) {
    assert.deepEqual(resolve({
      ...base,
      nowMs
    }), {
      status: "unavailable"
    });
  }
});
