import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { recordFormationEvent } from "../../domain/formation/recordFormationEvent";
import { FormationEventType } from "../../domain/formation/phase3_1_scope";

// If you don't, comment out the import + usage below.

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

function nowIso() {
  return new Date().toISOString();
}

app.http("postFormationNextStep", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "formation/next-step",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING" } };

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const visitorId = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
    if (!visitorId) return badRequest("visitorId required");

    const nextStep = typeof body?.nextStep === "string" ? body.nextStep.trim() : "";
    if (!nextStep) return badRequest("nextStep required");

    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

    const occurredAt =
      typeof body?.occurredAt === "string" && body.occurredAt.trim()
        ? body.occurredAt.trim()
        : nowIso();

    const input = {
      visitorId,
      type: FormationEventType.NEXT_STEP_SELECTED,
      occurredAt,
      channel: typeof body?.channel === "string" ? body.channel : undefined,
      visibility: typeof body?.visibility === "string" ? body.visibility : undefined,
      sensitivity: typeof body?.sensitivity === "string" ? body.sensitivity : undefined,
      summary: typeof body?.summary === "string" ? body.summary : "",
      metadata: {
        nextStep,
        ...(notes ? { notes } : {})
      },
      idempotencyKey: typeof body?.idempotencyKey === "string" ? body.idempotencyKey : undefined
    };

    const result = await recordFormationEvent(input as any, { storageConnectionString: connectionString });

    return {
      status: 200,
      jsonBody: {
        visitorId,
        eventType: "NEXT_STEP_SELECTED",
        nextStep,
        occurredAt,
        eventRowKey: result.eventRowKey,
        profile: result.profile
      }
    };
  }
});



