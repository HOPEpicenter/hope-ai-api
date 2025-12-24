// src/functions/formation/postFormationEvent.ts
import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureVisitorExists } from "../../storage/visitors/visitorsTable";
import { recordFormationEvent } from "../../domain/formation/recordFormationEvent";
import { FormationEventInput } from "../../domain/formation/phase3_1_scope";
import { toFormationProfileDto } from "../../domain/formation/formationDtos";

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

export async function postFormationEvent(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) {
    return {
      status: 500,
      jsonBody: { error: "Missing STORAGE_CONNECTION_STRING in configuration." },
    };
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const input = body as FormationEventInput;

  try {
    const result = await recordFormationEvent(input, {
      storageConnectionString: conn,
      ensureVisitorExists: async (visitorId: string) => {
        await ensureVisitorExists(visitorId);
      },
    });

    return {
      status: 201,
      jsonBody: {
        ok: true,
        visitorId: input.visitorId,
        eventId: result.eventRowKey,
        profile: toFormationProfileDto((result as any).profile ?? null),
      },
    };
  } catch (err: any) {
    const status = err?.statusCode ?? 500;
    const message =
      status === 500 ? "Server error" : (err?.message ?? "Error");

    context.error("postFormationEvent failed", err);
    return { status, jsonBody: { error: message } };
  }
}









