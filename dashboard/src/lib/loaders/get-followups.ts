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

  const data = await response.json();

  return {
    ok: !!data.ok,
    items: data.items ?? []
  };
}
