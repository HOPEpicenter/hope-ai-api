import {
  getFormationProfilesTableClient,
  listFormationProfiles,
  ensureTable,
  type FunctionFormationProfileEntity
} from "../_shared/formation";

function parseLimit(val: unknown, fallback = 200): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 500));
}

function parseCursor(val: unknown): string | undefined {
  const text = typeof val === "string" ? val.trim() : "";
  return text.length > 0 ? text : undefined;
}

function isOpenAssignedFollowup(profile: FunctionFormationProfileEntity): boolean {
  return !!profile.assignedTo && !profile.lastFollowupOutcomeAt;
}

export async function getDashboardFollowups(context: any, req: any): Promise<void> {
  try {
    const limit = parseLimit(req?.query?.limit, 200);
    const requestedCursor = parseCursor(req?.query?.cursor);

    const table = getFormationProfilesTableClient();

    await ensureTable(table);

    const collected: FunctionFormationProfileEntity[] = [];
    let sourceCursor = requestedCursor;
    let sourceHasMore = true;

    while (collected.length < (limit + 1) && sourceHasMore) {
      const page = await listFormationProfiles(table, {
        limit: 200,
        cursor: sourceCursor
      });

      const openAssigned = page.items.filter(isOpenAssignedFollowup);
      collected.push(...openAssigned);

      if (page.cursor) {
        sourceCursor = page.cursor;
      } else {
        sourceHasMore = false;
      }

      if (!page.cursor) {
        break;
      }

      if (page.items.length === 0) {
        break;
      }
    }

    const pageItems = collected.slice(0, limit);
    const nextCursor =
      collected.length > limit && pageItems.length > 0
        ? pageItems[pageItems.length - 1].rowKey
        : null;

    const items = pageItems.map((p) => {
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
        cursor: nextCursor,
        nextCursor,
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
