import { createVisitorRecord } from "../_shared/visitorsRepository";

type CreateVisitorBody = {
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function createVisitor(context: any, req: any): Promise<void> {
  try {
    const body = (req?.body ?? {}) as CreateVisitorBody;

    const first = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const last  = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const legacyFull = [first, last].filter(Boolean).join(" ").trim();

    const nameRaw =
      (typeof body.name === "string" ? body.name : undefined) ??
      (typeof body.fullName === "string" ? body.fullName : undefined) ??
      (legacyFull.length > 0 ? legacyFull : undefined);

    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";

    if (!name) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "name is required" }
      };
      return;
    }

    if (!emailRaw) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "email is required" }
      };
      return;
    }

    if (!isValidEmail(emailRaw)) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "email is invalid" }
      };
      return;
    }

    const result = await createVisitorRecord({ name, email: emailRaw });

    context.res = {
      status: result.created ? 201 : 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: true, visitorId: result.visitor.visitorId }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: "CREATE_VISITOR_FAILED" }
    };
  }
}
