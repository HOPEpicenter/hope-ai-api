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

      return {
        visitorId: item.visitorId,
        assignedTo: assignedOwnerId ? { ownerType: "user" as const, ownerId: assignedOwnerId } : null,
        stage: item.stage ?? null,
        needsFollowup: followupState === "action-needed",
        followupState,
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



