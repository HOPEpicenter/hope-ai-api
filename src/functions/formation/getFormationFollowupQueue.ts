import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";

app.http("getFormationFollowupQueue", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/followup-queue",
  handler: async (
    req: HttpRequest,
    context: InvocationContext
  ): Promise<HttpResponseInit> => {

    // 🔐 API key protection
    const auth = requireApiKey(req);
    if (auth) return auth;

    // 🔧 Query params (defaults)
    const windowHours = parsePositiveInt(req.query.get("windowHours"), 168);
    const maxResults = parsePositiveInt(req.query.get("maxResults"), 50);

    // ⏱ Timestamp
    const generatedAt = new Date().toISOString();

    // 🧱 Placeholder response (logic comes next step)
    return {
      status: 200,
      jsonBody: {
        generatedAt,
        windowHours,
        maxResults,
        count: 0,
        items: []
      }
    };
  }
});

/**
 * Local helper — intentionally duplicated
 * Matches existing formation endpoint pattern
 */
function parsePositiveInt(val: string | null, fallback: number): number {
  if (!val) return fallback;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
