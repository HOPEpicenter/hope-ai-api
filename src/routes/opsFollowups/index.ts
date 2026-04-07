import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";

type FollowupUrgency = "ON_TRACK" | "AT_RISK" | "OVERDUE";
type FollowupAgingBucket = "SAME_DAY" | "ONE_DAY" | "TWO_PLUS_DAYS";

function hoursBetween(a: string, b: string): number {
  const ams = Date.parse(a);
  const bms = Date.parse(b);
  if (Number.isNaN(ams) || Number.isNaN(bms)) return 0;
  return (bms - ams) / (1000 * 60 * 60);
}

function deriveQueueSignals(profile: any) {
  const assignedAt = profile?.lastFollowupAssignedAt ?? null;
  const contactedAt = profile?.lastFollowupContactedAt ?? null;
  const outcomeAt = profile?.lastFollowupOutcomeAt ?? null;
  const assignedTo = String(profile?.assignedTo ?? "").trim();

  const followupResolved =
    !!assignedAt &&
    !!outcomeAt &&
    String(outcomeAt) >= String(assignedAt);

  if (!assignedTo || followupResolved) {
    return {
      followupResolved,
      followupReason: undefined,
      followupUrgency: undefined as FollowupUrgency | undefined,
      followupPriorityScore: undefined as number | undefined,
      followupAgingBucket: undefined as FollowupAgingBucket | undefined,
      followupEscalated: false,
      needsFollowup: false,
    };
  }

  const ageHours = assignedAt
    ? hoursBetween(String(assignedAt), new Date().toISOString())
    : 0;

  let followupUrgency: FollowupUrgency | undefined;
  let followupPriorityScore: number | undefined;
  let followupAgingBucket: FollowupAgingBucket | undefined;
  let followupEscalated = false;

  if (ageHours >= 48) {
    followupUrgency = "OVERDUE";
    followupPriorityScore = 90;
    followupAgingBucket = "TWO_PLUS_DAYS";
    followupEscalated = true;
  } else if (ageHours >= 24) {
    followupUrgency = "AT_RISK";
    followupPriorityScore = 60;
    followupAgingBucket = "ONE_DAY";
    followupEscalated = false;
  } else {
    followupUrgency = "ON_TRACK";
    followupPriorityScore = 25;
    followupAgingBucket = "SAME_DAY";
    followupEscalated = false;
  }

  let followupReason: string | undefined;
  if (contactedAt) {
    followupReason = "FOLLOWUP_CONTACTED";
  } else {
    followupReason = "FOLLOWUP_ASSIGNED";
  }

  return {
    followupResolved,
    followupReason,
    followupUrgency,
    followupPriorityScore,
    followupAgingBucket,
    followupEscalated,
    needsFollowup: true,
  };
}

export const opsFollowupsRouter = Router();
opsFollowupsRouter.use(requireApiKey);

opsFollowupsRouter.get("/", async (req, res) => {
  const table = getFormationProfilesTableClient();

  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const parsedLimit = Number(limitRaw);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 25;

  const items: any[] = [];

  for await (const p of table.listEntities<any>({})) {
    const assignedTo = String((p as any).assignedTo ?? "").trim();
    if (!assignedTo) continue;

    const signals = deriveQueueSignals(p as any);
    if (signals.followupResolved) continue;
    if (!signals.needsFollowup) continue;

    items.push({
      visitorId: String((p as any).rowKey ?? (p as any).RowKey ?? ""),
      assignedTo: { ownerType: "user", ownerId: assignedTo },
      lastFollowupAssignedAt: (p as any).lastFollowupAssignedAt ?? null,
      lastFollowupContactedAt: (p as any).lastFollowupContactedAt ?? null,
      stage: (p as any).stage ?? null,
      needsFollowup: true,
      followupReason: signals.followupReason,
      followupUrgency: signals.followupUrgency,
      followupPriorityScore: signals.followupPriorityScore,
      followupAgingBucket: signals.followupAgingBucket,
      followupEscalated: signals.followupEscalated,
    });
  }

  items.sort((a, b) => {
    const escalatedDiff = Number(b.followupEscalated === true) - Number(a.followupEscalated === true);
    if (escalatedDiff !== 0) return escalatedDiff;

    const scoreA = Number(a.followupPriorityScore ?? 0);
    const scoreB = Number(b.followupPriorityScore ?? 0);
    if (scoreB !== scoreA) return scoreB - scoreA;

    const atA = String(a.lastFollowupAssignedAt ?? "");
    const atB = String(b.lastFollowupAssignedAt ?? "");
    return atA.localeCompare(atB);
  });

  return res.json({
    ok: true,
    v: 1,
    items: items.slice(0, limit),
  });
});