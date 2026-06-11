import { updateVisitorRecord } from "../_shared/visitorsRepository";
import { requireApiKeyForFunction } from "../_shared/apiKey";

type UpdateVisitorBody = {
  name?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  birthday?: string;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function updateVisitor(context: any, req: any): Promise<void> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ...auth.body, authRejectedBy: "updateVisitor" }
      };
      return;
    }

    const visitorId = String(req?.params?.visitorId ?? "").trim();
    const body = (req?.body ?? {}) as UpdateVisitorBody;

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const patch: UpdateVisitorBody = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        context.res = {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: { ok: false, error: "name is required" }
        };
        return;
      }
      patch.name = name;
    }

    if (typeof body.email === "string") {
      const email = body.email.trim();
      if (email && !isValidEmail(email)) {
        context.res = {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: { ok: false, error: "email is invalid" }
        };
        return;
      }
      patch.email = email;
    }

    if (typeof body.phone === "string") {
      patch.phone = body.phone.trim();
    }

    if (typeof body.address1 === "string") {
      patch.address1 = body.address1.trim();
    }

    if (typeof body.address2 === "string") {
      patch.address2 = body.address2.trim();
    }

    if (typeof body.city === "string") {
      patch.city = body.city.trim();
    }

    if (typeof body.state === "string") {
      patch.state = body.state.trim();
    }

    if (typeof body.postalCode === "string") {
      patch.postalCode = body.postalCode.trim();
    }

    if (typeof body.birthday === "string") {
      patch.birthday = body.birthday.trim();
    }

    const visitor = await updateVisitorRecord(visitorId, patch);

    if (!visitor) {
      context.res = {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "not found" }
      };
      return;
    }

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitor
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: err?.message ?? "UPDATE_VISITOR_FAILED" }
    };
  }
}

