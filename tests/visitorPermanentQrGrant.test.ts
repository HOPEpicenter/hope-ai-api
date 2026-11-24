import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";

import {
  issuePermanentVisitorQrGrant as issue,
  verifyPermanentVisitorQrGrant as verify,
  type PermanentQrGrantContext
} from "../src/services/visitors/permanentVisitorQrGrant";

// Synthetic test secret only. Never use for live credentials.
const secret = "synthetic-permanent-qr-test-secret-only";
const otherSecret = "different-synthetic-qr-test-secret-only";

const event = {
  id: "synthetic-sunday-service",
  date: "2026-11-29",
  name: "Synthetic Sunday Service",
  active: true
};

const policy = {
  enabled: true,
  ownerActivated: true,
    activationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  eventId: event.id,
  date: event.date,
  opensAtMs: Date.parse("2026-11-29T14:00:00Z"),
  closesAtMs: Date.parse("2026-11-29T18:00:00Z")
};

const context: PermanentQrGrantContext = {
  enabled: true,
  policy,
  selectedEventId: event.id,
  approvedEvents: [event],
  nowMs: Date.parse("2026-11-29T15:00:00Z")
};

function tokenFor(
  current: PermanentQrGrantContext = context
): string {
  const token = issue(secret, current);
  assert.ok(token);
  return token;
}

test("valid grant is bound to approved permanent event", () => {
  const result = verify(tokenFor(), secret, context);

  assert.ok(result);
  assert.equal(result.serviceId, event.id);
  assert.equal(result.date, event.date);
  assert.match(result.grantId, /^[0-9a-f-]{36}$/);
  assert.equal(
    result.expiresAtSeconds,
    Math.floor(context.nowMs / 1000) + 3600
  );

  assert.deepEqual(Object.keys(result).sort(), [
    "date", "expiresAtSeconds", "grantId", "serviceId"
  ]);
});

test("independent sessions receive distinct grant identities", () => {
  const first = verify(tokenFor(), secret, context);
  const second = verify(tokenFor(), secret, context);

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.grantId, second.grantId);
});

test("issuance and verification are disabled by default", () => {
  const disabled = { ...context, enabled: undefined };

  assert.equal(issue(secret, disabled), null);
  assert.equal(verify(tokenFor(), secret, disabled), null);
});

test("owner deactivation denies issuance and existing grants", () => {
  const inactive = {
    ...context,
    policy: { ...policy, ownerActivated: false }
  };

  assert.equal(issue(secret, inactive), null);
  assert.equal(verify(tokenFor(), secret, inactive), null);
});

test("unapproved and inactive events cannot authorize grants", () => {
  for (const approvedEvents of [
    [],
    [{ ...event, active: false }]
  ]) {
    const denied = { ...context, approvedEvents };

    assert.equal(issue(secret, denied), null);
    assert.equal(verify(tokenFor(), secret, denied), null);
  }
});

test("grant cannot be used for a different approved event", () => {
  const second = { ...event, id: "another-approved-event" };

  const changed = {
    ...context,
    selectedEventId: second.id,
    policy: { ...policy, eventId: second.id },
    approvedEvents: [event, second]
  };

  assert.ok(issue(secret, changed));
  assert.equal(verify(tokenFor(), secret, changed), null);
});

test("changed approved registration window invalidates old grant", () => {
  const changed = {
    ...context,
    policy: {
      ...policy,
      closesAtMs: policy.closesAtMs - 60000
    }
  };

  assert.ok(issue(secret, changed));
  assert.equal(verify(tokenFor(), secret, changed), null);
});

test("grant lifetime is capped at the event closing time", () => {
  const nearClose = {
    ...context,
    nowMs: policy.closesAtMs - 60000
  };

  const token = tokenFor(nearClose);
  const verified = verify(token, secret, nearClose);

  assert.ok(verified);

  assert.equal(
    verified.expiresAtSeconds,
    Math.floor(policy.closesAtMs / 1000)
  );

  const closed = {
    ...context,
    nowMs: policy.closesAtMs
  };

  assert.equal(issue(secret, closed), null);
  assert.equal(verify(token, secret, closed), null);
});

test("expired and not-yet-issued grants are denied", () => {
  const token = issue(secret, context, 60);
  assert.ok(token);

  assert.equal(verify(token, secret, {
    ...context,
    nowMs: context.nowMs + 60000
  }), null);

  assert.equal(verify(token, secret, {
    ...context,
    nowMs: context.nowMs - 1000
  }), null);
});

test("missing short and incorrect signing secrets fail closed", () => {
  for (const invalidSecret of [undefined, "", "short"]) {
    assert.equal(issue(invalidSecret, context), null);

    assert.equal(
      verify(tokenFor(), invalidSecret, context), null
    );
  }

  assert.equal(verify(tokenFor(), otherSecret, context), null);
});

test("tampered and malformed grants are rejected", () => {
  const token = tokenFor();
  const [prefix, payload, sig] = token.split(".");

  const changedPayload =
    (payload[0] === "A" ? "B" : "A") + payload.slice(1);

  const changedSig =
    (sig[0] === "A" ? "B" : "A") + sig.slice(1);

  for (const invalid of [
    `${prefix}.${changedPayload}.${sig}`,
    `${prefix}.${payload}.${changedSig}`,
    `q1.${payload}.${sig}`,
    `${token}.extra`,
    "",
    "x".repeat(1025)
  ]) {
    assert.equal(verify(invalid, secret, context), null);
  }
});

test("invalid lifetimes and out-of-window issuance are denied", () => {
  for (const lifetime of [0, -1, 3601, NaN, 1.5]) {
    assert.equal(issue(secret, context, lifetime), null);
  }

  assert.equal(issue(secret, {
    ...context,
    nowMs: policy.opensAtMs - 1
  }), null);

  assert.equal(issue(secret, {
    ...context,
    selectedEventId: undefined
  }), null);
});


test("missing or malformed activation identity fails closed", () => {
  const token = tokenFor();

  for (const activationId of [
    undefined,
    "",
    "invalid-activation"
  ]) {
    const invalid = {
      ...context,
      policy: {
        ...context.policy!,
        activationId
      }
    };

    assert.equal(issue(secret, invalid), null);
    assert.equal(verify(token, secret, invalid), null);
  }
});

test("reactivation with a new identity cannot revive an old grant", () => {
  const oldToken = tokenFor();

  const deactivated = {
    ...context,
    policy: {
      ...context.policy!,
      ownerActivated: false
    }
  };

  assert.equal(
    verify(oldToken, secret, deactivated),
    null
  );

  const reactivated = {
    ...context,
    policy: {
      ...context.policy!,
      ownerActivated: true,
      activationId:
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }
  };

  // Event and registration window remain identical.
  assert.equal(
    verify(oldToken, secret, reactivated),
    null
  );

  const newToken = issue(secret, reactivated);

  assert.ok(newToken);
  assert.ok(newToken.startsWith("q3."));

  assert.ok(
    verify(newToken, secret, reactivated)
  );

  assert.equal(
    verify(newToken, secret, context),
    null
  );
});

test("correctly signed pre-activation q2 credential is rejected", () => {
  const token = tokenFor();
  const payload = token.split(".")[1];

  const claims = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  ) as Record<string, unknown>;

  delete claims.activation;
  claims.v = 2;

  const oldPayload = Buffer.from(
    JSON.stringify(claims),
    "utf8"
  ).toString("base64url");

  const signed = `q2.${oldPayload}`;

  const signature = createHmac("sha256", secret)
    .update(signed, "utf8")
    .digest("base64url");

  const legacy = `${signed}.${signature}`;

  assert.equal(
    verify(legacy, secret, context),
    null
  );
});
