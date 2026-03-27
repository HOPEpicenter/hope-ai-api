type RawFormationProfile = {
  visitorId?: unknown;
  rowKey?: unknown;
  assignedTo?: unknown;
  stage?: unknown;
  lastFollowupAssignedAt?: unknown;
  lastFollowupContactedAt?: unknown;
  lastFollowupOutcomeAt?: unknown;
};

type RawFormationProfilesResponse = {
  ok?: unknown;
  items?: unknown;
};

export type FormationProfileListItem = {
  visitorId: string;
  assignedTo: string | null;
  stage: string | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupContactedAt: string | null;
  lastFollowupOutcomeAt: string | null;
};

export type FormationProfilesResponse = {
  ok: true;
  items: FormationProfileListItem[];
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function toIsoOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function getFormationProfiles(): Promise<FormationProfilesResponse> {
  const baseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("HOPE_API_KEY");

  const response = await fetch(`${baseUrl}/api/formation/profiles?limit=200`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GET /api/formation/profiles failed with status ${response.status}`);
  }

  const data = (await response.json()) as RawFormationProfilesResponse;

  if (data.ok !== true || !Array.isArray(data.items)) {
    throw new Error("Invalid /api/formation/profiles response shape");
  }

  const items = (data.items as RawFormationProfile[])
    .map((profile) => {
      const visitorId =
        typeof profile.visitorId === "string" && profile.visitorId.trim().length > 0
          ? profile.visitorId.trim()
          : typeof profile.rowKey === "string" && profile.rowKey.trim().length > 0
            ? profile.rowKey.trim()
            : "";

      if (!visitorId) {
        return null;
      }

      return {
        visitorId,
        assignedTo:
          typeof profile.assignedTo === "string" && profile.assignedTo.trim().length > 0
            ? profile.assignedTo.trim()
            : null,
        stage:
          typeof profile.stage === "string" && profile.stage.trim().length > 0
            ? profile.stage.trim()
            : null,
        lastFollowupAssignedAt: toIsoOrNull(profile.lastFollowupAssignedAt),
        lastFollowupContactedAt: toIsoOrNull(profile.lastFollowupContactedAt),
        lastFollowupOutcomeAt: toIsoOrNull(profile.lastFollowupOutcomeAt)
      };
    })
    .filter((item): item is FormationProfileListItem => item !== null);

  return {
    ok: true,
    items
  };
}
