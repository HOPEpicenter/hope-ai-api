import assert from "node:assert/strict";
import { postMinistryEmailDeliveryVoid } from "../../src/functions/postMinistryEmailDeliveryVoid";
import { postMinistryEmailDeliveryDispatch } from "../../src/functions/postMinistryEmailDeliveryDispatch";
import type { VoidMinistryEmailDeliveryResult } from "../../src/services/communications/voidMinistryEmailDelivery";

const PRIVATE = ["PRIVATE_SUBJECT", "PRIVATE_BODY", "private@example.org", "SECRET_STORAGE_ERROR", "PRIVATE_REASON"];

function context() {
  return { res: undefined, log: { error() {}, info() {} } } as any;
}
function request(body: unknown = { reason: "PRIVATE_REASON" }, deliveryId = "delivery-1"): any {
  return { headers: { "x-request-id": "request-1" }, params: { deliveryId }, body };
}
const admin = async () => ({ ok: true as const, actorId: "canonical-admin" });

async function call(
  result: VoidMinistryEmailDeliveryResult | Error,
  req = request()
) {
  const c = context();
  const calls: any[] = [];
  await postMinistryEmailDeliveryVoid(c, req, {
    authorize: admin as any,
    voidDelivery: async i => {
      calls.push(i);
      if (result instanceof Error) throw result;
      return result;
    }
  });
  return { res: c.res, calls };
}

async function run(): Promise<void> {
  {
    const c = context();
    let calls = 0;
    await postMinistryEmailDeliveryVoid(c, request(), {
      authorize: async () => ({ ok: false, status: 403, body: { ok: false, error: "Forbidden" } }) as any,
      voidDelivery: async () => { calls += 1; throw new Error("unreachable"); }
    });
    assert.equal(c.res.status, 403);
    assert.equal(calls, 0);
  }

  {
    const { res, calls } = await call(
      { status: "voided", deliveryId: "delivery-1", voidedAt: "2026-10-04T10:00:00.000Z" },
      request({ reason: "r", voidedBy: "attacker", actorId: "attacker" })
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.void.state, "voided");
    assert.equal(res.body.void.alreadyVoided, false);
    assert.deepEqual(calls, [{ deliveryId: "delivery-1", actorId: "canonical-admin", reason: "r" }]);
  }

  {
    const { res } = await call(
      { status: "already_voided", deliveryId: "delivery-1", voidedAt: "2026-10-04T10:00:00.000Z" }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.void.alreadyVoided, true);
  }

  {
    const c = context();
    await postMinistryEmailDeliveryVoid(c, request({ reason: "r" }, "  "), { authorize: admin as any });
    assert.equal(c.res.status, 400);
  }

  for (const body of [{ none: true }, null, [], {}, { reason: "  " }, { reason: 5 }, { reason: "x".repeat(241) }]) {
    const c = context();
    await postMinistryEmailDeliveryVoid(c, request(body), {
      authorize: admin as any,
      voidDelivery: async i => {
        const { voidMinistryEmailDelivery } = await import("../../src/services/communications/voidMinistryEmailDelivery");
        return voidMinistryEmailDelivery(i, {
          repository: {
            readVersionedById: async () => { throw new Error("must not read"); },
            voidIfVersion: async () => { throw new Error("must not write"); }
          }
        });
      }
    });
    assert.equal(c.res.status, 400);
    assert.equal(c.res.body.error.code, "INVALID_MINISTRY_EMAIL_DELIVERY_VOID_INPUT");
  }

  const cases: Array<[VoidMinistryEmailDeliveryResult | Error, number, string]> = [
    [{ status: "not_found", deliveryId: "delivery-1" }, 404, "MINISTRY_EMAIL_DELIVERY_NOT_FOUND"],
    [{ status: "not_voidable", deliveryId: "delivery-1" }, 409, "MINISTRY_EMAIL_DELIVERY_NOT_VOIDABLE"],
    [{ status: "conflict", deliveryId: "delivery-1" }, 409, "MINISTRY_EMAIL_DELIVERY_VOID_CONFLICT"],
    [{ status: "persistence_uncertain", deliveryId: "delivery-1" }, 503, "MINISTRY_EMAIL_DELIVERY_VOID_UNCERTAIN"],
    [new Error("SECRET_STORAGE_ERROR PRIVATE_BODY private@example.org"), 500, "MINISTRY_EMAIL_DELIVERY_VOID_FAILED"]
  ];
  for (const [result, status, code] of cases) {
    const { res } = await call(result);
    assert.equal(res.status, status);
    assert.equal(res.body.error.code, code);
    const serialized = JSON.stringify(res.body);
    for (const value of PRIVATE) assert.equal(serialized.includes(value), false);
  }

  {
    const c = context();
    await postMinistryEmailDeliveryDispatch(c, request(), {
      authorize: admin as any,
      dispatch: async () => ({ deliveryId: "delivery-1", status: "delivery_voided", reconciliationRequired: false })
    });
    assert.equal(c.res.status, 409);
    assert.equal(c.res.body.error.code, "MINISTRY_EMAIL_DELIVERY_VOIDED");
    assert.equal(c.res.body.dispatch.reconciliationRequired, false);
  }

  console.log("postMinistryEmailDeliveryVoid.test.ts passed");
}

run().catch(error => { console.error(error); process.exit(1); });
