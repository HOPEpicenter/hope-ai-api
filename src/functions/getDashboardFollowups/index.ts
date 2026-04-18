import {
  getFormationProfilesTableClient,
  listFormationProfiles,
  ensureTable
} from "../_shared/formation";

function parseLimit(val: unknown, fallback = 200): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 500));
}

export async function getDashboardFollowups(context: any, req: any): Promise<void> {
  try {
    const limit = parseLimit(req?.query?.limit, 200);

    const table = getFormationProfilesTableClient();

    // ✅ CRITICAL FIX
    await ensureTable(table);

    const result = await listFormationProfiles(table, {
      limit
    });

    const items = result.items
      .filter(p =>
        p.assignedTo &&
        !p.lastFollowupOutcomeAt
      )
      .map(p => {
        const followupState =
          p.lastFollowupContactedAt
            ? "Contacted"
            : "Assigned";

        return {
          visitorId: p.visitorId,
          name: p.visitorId,
          email: null,
          assignedTo: p.assignedTo,
          followupState,
          attentionState:
            followupState === "Assigned"
              ? "Action needed"
              : "Contact made",
          lastFollowupAssignedAt: p.lastFollowupAssignedAt ?? null,
          lastFollowupContactedAt: p.lastFollowupContactedAt ?? null
        };
      });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        count: items.length,
        limit,
        items
      }
    };

  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      body: { ok: false, error: "GET_DASHBOARD_FOLLOWUPS_FAILED" }
    };
  }
}
