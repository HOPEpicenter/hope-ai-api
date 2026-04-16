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
    lastFollowupOutcome?: string | null;
  }>;
  cursor?: string | null;
};

function getHopeBaseUrl(): string {
  const value = process.env.HOPE_BASE_URL?.trim();
  if (!value) {
    throw new Error("Missing HOPE_BASE_URL");
  }
  return value.replace(/\/+$/, "");
}

function getApiKey(): string {
  const value = process.env.HOPE_API_KEY?.trim();
  if (!value) {
    throw new Error("Missing HOPE_API_KEY");
  }
  return value;
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
  const items = raw.items
    .map((item) => {
      const assignedOwnerId =
        typeof item.assignedTo === "string"
          ? item.assignedTo.trim()
          : item.assignedTo?.ownerId?.trim?.() ?? "";

      const hasAssignee = assignedOwnerId.length > 0;
      const hasAssignedAt = !!item.lastFollowupAssignedAt;
      const hasContacted = !!item.lastFollowupContactedAt;
      const hasOutcome = !!item.lastFollowupOutcomeAt;

      if (!item.visitorId || !hasAssignedAt) {
        return null;
      }

      const resolvedForAssignment = hasOutcome;

      if (resolvedForAssignment) {
        return null;
      }

      const ageHours = getAgeHours(item.lastFollowupAssignedAt ?? null);
      const ageBucket = getAgeBucket(ageHours);
      const urgency = getUrgency(ageBucket);
      const followupState: "contact-made" | "action-needed" = hasContacted ? "contact-made" : "action-needed";

      return {
        visitorId: item.visitorId,
        assignedTo: hasAssignee
          ? { ownerType: "user" as const, ownerId: assignedOwnerId }
          : null,
        stage: item.stage ?? null,
        needsFollowup: !hasContacted,
        followupState,
        ageBucket,
        urgency,
        lastFollowupAssignedAt: item.lastFollowupAssignedAt ?? null,
        lastFollowupContactedAt: item.lastFollowupContactedAt ?? null,
        lastFollowupOutcomeAt: item.lastFollowupOutcomeAt ?? null,
        lastFollowupOutcome: item.lastFollowupOutcome ?? null,
        resolvedForAssignment
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    ok: !!raw.ok,
    items
  };
}

export async function getFollowups(): Promise<FollowupsResponse> {
  const response = await fetch(`${getHopeBaseUrl()}/api/formation/profiles?limit=200`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "x-api-key": getApiKey()
    }
  });

  if (!response.ok) {
    throw new Error(`GET /api/formation/profiles failed with status ${response.status}`);
  }

  const data = (await response.json()) as RawFormationProfilesResponse;
  return toFollowupsResponse(data);
}

