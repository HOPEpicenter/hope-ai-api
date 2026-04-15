import type { FollowupsResponse } from "@/lib/contracts/followups";

type RawFormationProfilesResponse = {
  ok: boolean;
  items: Array<{
    visitorId: string;
    assignedTo?: string | { ownerId?: string | null } | null;
    stage?: string | null;
    lastFollowupAssignedAt?: string | null;
    lastFollowupContactedAt?: string | null;
    lastFollowupOutcomeAt?: string | null;
  }>;
  cursor?: string;
};

function getBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "http://127.0.0.1:3000";

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/\/+$/, "");
  }

  return `https://${url.replace(/\/+$/, "")}`;
}

function getAgeHours(value: string | null | undefined): number | null {
  if (!value) return null;

  const assignedMs = new Date(value).getTime();
  if (Number.isNaN(assignedMs)) return null;

  const diffMs = Date.now() - assignedMs;
  if (diffMs < 0) return 0;

  return diffMs / (1000 * 60 * 60);
}

function getAgeBucket(hours: number | null): "<24h" | "24-48h" | "48-72h" | "72h+" {
  if (hours === null) return "<24h";
  if (hours >= 72) return "72h+";
  if (hours >= 48) return "48-72h";
  if (hours >= 24) return "24-48h";
  return "<24h";
}

function getUrgency(bucket: "<24h" | "24-48h" | "48-72h" | "72h+"): "ON_TRACK" | "WATCH" | "AT_RISK" | "OVERDUE" {
  switch (bucket) {
    case "72h+":
      return "OVERDUE";
    case "48-72h":
      return "AT_RISK";
    case "24-48h":
      return "WATCH";
    default:
      return "ON_TRACK";
  }
}

function toFollowupsResponse(raw: RawFormationProfilesResponse): FollowupsResponse {
  return {
    ok: !!raw.ok,
    items: raw.items.map((item) => {
      const assignedOwnerId =
        typeof item.assignedTo === "string"
          ? item.assignedTo
          : item.assignedTo?.ownerId ?? null;

      const hasOutcome = !!item.lastFollowupOutcomeAt;
      const hasContacted = !!item.lastFollowupContactedAt;
      const isAssigned = !!assignedOwnerId;

      const followupState =
        hasOutcome
          ? "done"
          : hasContacted
          ? "contact-made"
          : isAssigned
          ? "action-needed"
          : "unassigned";

      const ageHours = getAgeHours(item.lastFollowupAssignedAt ?? null);
      const ageBucket = getAgeBucket(ageHours);
      const urgency = getUrgency(ageBucket);

      return {
        visitorId: item.visitorId,
        assignedTo: assignedOwnerId ? { ownerType: "user" as const, ownerId: assignedOwnerId } : null,
        stage: item.stage ?? null,
        needsFollowup: followupState === "action-needed",
        followupState,
        ageBucket,
        urgency,
        lastFollowupAssignedAt: item.lastFollowupAssignedAt ?? null,
        lastFollowupContactedAt: item.lastFollowupContactedAt ?? null,
        lastFollowupOutcomeAt: item.lastFollowupOutcomeAt ?? null,
        lastFollowupOutcome: null,
        resolvedForAssignment: hasOutcome || hasContacted
      };
    })
  };
}

export async function getFollowups(): Promise<FollowupsResponse> {
  const response = await fetch(`${getBaseUrl()}/api/dashboard/followups?limit=200`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GET /api/dashboard/followups failed with status ${response.status}`);
  }

  const data = (await response.json()) as RawFormationProfilesResponse;
  return toFollowupsResponse(data);
}
