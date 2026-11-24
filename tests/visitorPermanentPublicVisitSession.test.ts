import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";

import {
  issuePermanentPublicVisitSession as issue,
  verifyPermanentPublicVisitSession as verify
} from "../src/services/visitors/permanentPublicVisitSession";

import type {
  PermanentPublicVisitContext
} from "../src/services/visitors/resolvePermanentPublicVisitEvent";

const secret =
  "synthetic-permanent-public-session-secret-only";

const event = {
  id: "synthetic-weekday-event",
  date: "2026-11-24",
  name: "Synthetic Weekday Service",
  active: true
};

const secondEvent = {
  ...event,
  id: "synthetic-second-event",
  name: "Synthetic Second Service"
};

const context: PermanentPublicVisitContext = {
  enabled: true,
  nowMs: Date.parse("2026-11-24T19:00:00Z"),
  approvedEvents: [event]
};

function tokenFor(
  current: PermanentPublicVisitContext = context
): string {
  const token = issue(secret, current);
  assert.ok(token);
  return token;
}

test("automatic session requires no activation or device identity", () => {
  const token = tokenFor();

  assert.ok(token.startsWith("p1."));

  const result = verify(token, secret, context);

  assert.ok(result);
  assert.equal(result.serviceId, event.id);
  assert.equal(result.date, event.date);

  assert.equal(
    result.expiresAtSeconds,
    Math.floor(context.nowMs / 1000) + 600
  );
});

test("unscheduled weekday and Sunday sessions are supported", () => {
  for (const [timestamp, expectedServiceId] of [
    [
      "2026-11-24T19:00:00Z",
      "visit-2026-11-24"
    ],
    [
      "2026-11-29T15:00:00Z",
      "sunday-2026-11-29"
    ]
  ]) {
    const current = {
      enabled: true,
      nowMs: Date.parse(timestamp),
      approvedEvents: []
    };

    const result = verify(
      tokenFor(current),
      secret,
      current
    );

    assert.ok(result);
    assert.equal(
      result.serviceId,
      expectedServiceId
    );
  }
});

test("independent browsers receive distinct session identities", () => {
  const first = verify(
    tokenFor(), secret, context
  );

  const second = verify(
    tokenFor(), secret, context
  );

  assert.ok(first);
  assert.ok(second);

  assert.notEqual(
    first.grantId,
    second.grantId
  );
});

test("deployment disablement and invalid secrets fail closed", () => {
  const token = tokenFor();

  for (const enabled of [false, undefined]) {
    const disabled = {
      ...context,
      enabled
    };

    assert.equal(issue(secret, disabled), null);
    assert.equal(
      verify(token, secret, disabled),
      null
    );
  }

  for (const invalidSecret of [
    undefined,
    "",
    "short",
    "x".repeat(513)
  ]) {
    assert.equal(
      issue(invalidSecret, context),
      null
    );

    assert.equal(
      verify(token, invalidSecret, context),
      null
    );
  }

  assert.equal(
    verify(token, "z".repeat(40), context),
    null
  );
});

test("multiple events require valid event selection", () => {
  const ambiguous = {
    ...context,
    approvedEvents: [event, secondEvent]
  };

  assert.equal(
    issue(secret, ambiguous),
    null
  );

  const selected = {
    ...ambiguous,
    selectedEventId: secondEvent.id
  };

  const result = verify(
    tokenFor(selected),
    secret,
    selected
  );

  assert.ok(result);
  assert.equal(
    result.serviceId,
    secondEvent.id
  );

  assert.equal(issue(secret, {
    ...ambiguous,
    selectedEventId: "unknown-event"
  }), null);
});

test("sessions cannot cross event boundaries or use removed events", () => {
  const token = tokenFor();

  const changed = {
    ...context,
    approvedEvents: [event, secondEvent],
    selectedEventId: secondEvent.id
  };

  assert.equal(
    verify(token, secret, changed),
    null
  );

  assert.equal(
    verify(token, secret, {
      ...context,
      approvedEvents: []
    }),
    null
  );

  assert.equal(
    verify(token, secret, {
      ...context,
      approvedEvents: [
        { ...event, active: false }
      ]
    }),
    null
  );
});

test("session expiry and future issuance fail closed", () => {
  const token = tokenFor();

  assert.ok(verify(token, secret, {
    ...context,
    nowMs: context.nowMs + 599000
  }));

  assert.equal(verify(token, secret, {
    ...context,
    nowMs: context.nowMs + 600000
  }), null);

  assert.equal(verify(token, secret, {
    ...context,
    nowMs: context.nowMs - 1000
  }), null);
});

test("Eastern midnight invalidates the previous day's session", () => {
  const before = {
    enabled: true,
    nowMs: Date.parse("2026-11-24T04:59:50Z"),
    approvedEvents: []
  };

  const token = tokenFor(before);

  const after = {
    ...before,
    nowMs: before.nowMs + 20000
  };

  assert.equal(
    verify(token, secret, after),
    null
  );

  const fresh = verify(
    tokenFor(after), secret, after
  );

  assert.ok(fresh);
  assert.equal(
    fresh.date,
    "2026-11-24"
  );
});

test("tampered malformed and legacy credentials are rejected", () => {
  const token = tokenFor();
  const [prefix, payload, signature] =
    token.split(".");

  const changedSignature =
    (signature[0] === "A" ? "B" : "A") +
    signature.slice(1);

  for (const invalid of [
    undefined,
    "",
    "x".repeat(4097),
    `${prefix}.${payload}.${changedSignature}`,
    `${prefix}.${payload}=.${signature}`,
    `${token}.extra`,
    `q3.${payload}.${signature}`
  ]) {
    assert.equal(
      verify(invalid, secret, context),
      null
    );
  }
});

test("signed wrong-purpose or unexpected claims are rejected", () => {
  const token = tokenFor();

  const claims = JSON.parse(
    Buffer.from(
      token.split(".")[1],
      "base64url"
    ).toString("utf8")
  ) as Record<string, unknown>;

  for (const altered of [
    {
      ...claims,
      purpose: "unrelated-purpose"
    },
    {
      ...claims,
      unexpected: true
    },
    {
      ...claims,
      exp: Number(claims.iat) + 3600
    }
  ]) {
    const payload = Buffer.from(
      JSON.stringify(altered),
      "utf8"
    ).toString("base64url");

    const signed = `p1.${payload}`;

    const signature = createHmac(
      "sha256", secret
    ).update(signed, "utf8")
      .digest("base64url");

    assert.equal(
      verify(
        `${signed}.${signature}`,
        secret,
        context
      ),
      null
    );
  }
});
