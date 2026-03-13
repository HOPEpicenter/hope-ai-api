import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";

export const opsFollowupsRouter = Router();
opsFollowupsRouter.use(requireApiKey);

function toMs(v: any): number | null {
  if (!v) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

opsFollowupsRouter.get("/", async (_req, res) => {
  const table = getFormationProfilesTableClient();
  await ensureTableExists(table);

  const items: any[] = [];

  for await (const p of table.listEntities<any>({})) {
    const assignedTo = String((p as any).assignedTo ?? "").trim();

    const assignedAt = (p as any).lastFollowupAssignedAt ?? null;
    const contactedAt = (p as any).lastFollowupContactedAt ?? null;
    const outcomeAt = (p as any).lastFollowupOutcomeAt ?? null;
    const outcome = (p as any).lastFollowupOutcome ?? null;

    const assignedAtMs = toMs(assignedAt);
    const contactedAtMs = toMs(contactedAt);
    const outcomeAtMs = toMs(outcomeAt);

    if (assignedAtMs === null) continue;

    // Only consider the followup "resolved" if the outcome is for the current assignment.
    const resolvedForAssignment =
      outcomeAtMs !== null && outcomeAtMs >= assignedAtMs;

    if (resolvedForAssignment) continue;

    const needsFollowup =
      contactedAtMs === null ||
      (contactedAtMs !== null && assignedAtMs > contactedAtMs);

    items.push({
      visitorId: String((p as any).rowKey ?? (p as any).RowKey ?? ""),
      assignedTo: assignedTo ? { ownerType: "user", ownerId: assignedTo } : null,
      lastFollowupAssignedAt: assignedAt,
      lastFollowupContactedAt: contactedAt,
      lastFollowupOutcomeAt: outcomeAt,
      lastFollowupOutcome: outcome,
      resolvedForAssignment: resolvedForAssignment,
      stage: (p as any).stage ?? null,
      needsFollowup,
    });
  }

  return res.json({ ok: true, items });
});



