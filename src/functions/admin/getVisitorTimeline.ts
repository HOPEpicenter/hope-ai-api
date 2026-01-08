import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import {
  getFormationEventsTableClient,
  getFormationProfilesTableClient
} from "../../storage/formation/formationTables";
import { computeFromProfile } from "../../domain/formation/computeFromProfile";

function parsePositiveInt(val: string | null | undefined, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function safeJsonParse(s: any): any {
  if (s == null) return null;
  if (typeof s === "object") return s;
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function formatEventDisplay(type: string | null, meta: any): string {
  const parts: string[] = [];
  const t = type ?? "UNKNOWN_EVENT";
  parts.push(t);

  const assignee = meta?.assigneeId ? String(meta.assigneeId) : "";
  const ch = meta?.channel ? String(meta.channel) : "";

  if (assignee) parts.push("-> " + assignee + (ch ? " (" + ch + ")" : ""));
  else if (ch) parts.push("(" + ch + ")");

  const notes = meta?.notes ? String(meta.notes) : "";
  if (notes) parts.push("- " + notes);

  const run = meta?.automationRunId ? String(meta.automationRunId) : "";
  if (run) parts.push("[run:" + run + "]");

  return parts.join(" ");
}

export async function getVisitorTimeline(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    return { status: 500, jsonBody: { ok: false, error: "STORAGE_CONNECTION_STRING missing" } };
  }

  const visitorId = (req.params as any)?.visitorId as string | undefined;
  if (!visitorId) {
    return { status: 400, jsonBody: { ok: false, error: "visitorId missing" } };
  }

  const limit = parsePositiveInt(req.query.get("limit"), 200);
  const now = new Date();

  const profiles = getFormationProfilesTableClient(connectionString);
  const eventsTable = getFormationEventsTableClient(connectionString);

  await ensureTableExists(profiles);
  await ensureTableExists(eventsTable);

  // -----------------------------
  // Load FULL profile snapshot
  // -----------------------------
  let profile: any = {
    visitorId,
    stage: "Unknown",
    stageUpdatedAt: null,
    stageUpdatedBy: null,
    stageReason: null,
    assignedTo: null,
    lastFollowupAssignedAt: null,
    lastFollowupOutcomeAt: null,
    lastActivityAt: null,
    lastEventAt: null,
    lastEventType: null
  };

  try {
    const ent: any = await profiles.getEntity("VISITOR", visitorId);

    profile = {
      visitorId,
      stage: ent.stage ?? "Unknown",
      stageUpdatedAt: ent.stageUpdatedAt ?? null,
      stageUpdatedBy: ent.stageUpdatedBy ?? null,
      stageReason: ent.stageReason ?? null,

      assignedTo: ent.assignedTo ?? null,
      lastFollowupAssignedAt: ent.lastFollowupAssignedAt ?? null,
      lastFollowupOutcomeAt: ent.lastFollowupOutcomeAt ?? null,

      lastActivityAt: ent.lastActivityAt ?? null,

      // keep legacy/debug fields if present
      lastEventAt: ent.lastEventAt ?? null,
      lastEventType: ent.lastEventType ?? null
    };
  } catch {
    // profile may not exist yet
  }

  // -----------------------------
  // Compute current state (brain)
  // -----------------------------
  const computed = computeFromProfile({ ...(profile as any) }, now);

  // -----------------------------
  // Pull events for visitor
  // -----------------------------
  const formationEventsRaw: any[] = [];
  let scanned = 0;

  for await (const e of eventsTable.listEntities<any>({
    queryOptions: { filter: `PartitionKey eq '${visitorId}'` }
  })) {
    scanned++;
    formationEventsRaw.push(e);
  }

  // sort desc by occurredAt (ISO strings sort lexicographically)
  formationEventsRaw.sort((a, b) => String(b.occurredAt ?? "").localeCompare(String(a.occurredAt ?? "")));

  const formationEvents = formationEventsRaw.slice(0, limit).map((e) => {
    const meta = safeJsonParse((e as any).metadata);
    const ev: any = {
      eventId: (e as any).eventId ?? (e as any).rowKey ?? (e as any).RowKey ?? null,
      visitorId: (e as any).visitorId ?? visitorId,
      type: (e as any).type ?? null,
      occurredAt: (e as any).occurredAt ?? null,
      recordedAt: (e as any).recordedAt ?? null,
      channel: (e as any).channel ?? "unknown",
      visibility: (e as any).visibility ?? "staff",
      sensitivity: (e as any).sensitivity ?? "none",
      summary: (e as any).summary ?? "",
      metadata: meta,
      data: e
    };
    ev.display = formatEventDisplay((e as any).type ?? null, meta);
    return ev;
  });

  // -----------------------------
  // Response
  // -----------------------------
  return {
    status: 200,
    jsonBody: {
      ok: true,
      version: 1,
      visitorId,
      nowIso: now.toISOString(),
      profile,
      explain: {
        visitorId,
        stage: computed.stage,
        needsFollowup:
          (computed as any).needsFollowup ??
          (computed.urgency === "DUE_SOON" || computed.urgency === "OVERDUE"),
        urgency: computed.urgency,
        recommendedAction: computed.recommendedAction,
        reasons: (computed as any).reasons ?? (computed.reason ? [computed.reason] : []),
        suppressions: (computed as any).suppressions ?? [],
        raw: computed
      },
      formationEvents,
      debug: {
        eventsScanned: scanned,
        returned: formationEvents.length
      }
    }
  };
}

app.http("getVisitorTimeline", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ops/visitors/{visitorId}/timeline",
  handler: getVisitorTimeline
});
