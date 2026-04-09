type RawFormationProfile = {
  visitorId?: unknown;
  rowKey?: unknown;
  assignedTo?: unknown;
  stage?: unknown;
  lastEventType?: unknown;
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
  lastEventType: string | null;
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

function normalizeProfile(profile: RawFormationProfile | null | undefined): FormationProfileListItem | null {
  if (!profile || typeof profile !== "object") {
    return null;
  }

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
    lastEventType:
      typeof profile.lastEventType === "string" && profile.lastEventType.trim().length > 0
        ? profile.lastEventType.trim()
        : null,
    lastFollowupAssignedAt: toIsoOrNull(profile.lastFollowupAssignedAt),
    lastFollowupContactedAt: toIsoOrNull(profile.lastFollowupContactedAt),
    lastFollowupOutcomeAt: toIsoOrNull(profile.lastFollowupOutcomeAt)
  };
}

async function getFormationProfileByVisitorId(
  baseUrl: string,
  apiKey: string,
  visitorId: string
): Promise<FormationProfileListItem | null> {
  const response = await fetch(
    `${baseUrl}/visitors/${encodeURIComponent(visitorId)}/formation/profile`,
    {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        accept: "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  const candidate =
    typeof data === "object" && data !== null && "profile" in data
      ? (data as { profile?: unknown }).profile
      : typeof data === "object" && data !== null && "item" in data
        ? (data as { item?: unknown }).item
        : data;

  return normalizeProfile(candidate as RawFormationProfile);
}

export async function getFormationProfiles(visitorIds?: string[]): Promise<FormationProfilesResponse> {
  const baseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("HOPE_API_KEY");

  const distinctVisitorIds = Array.from(
    new Set(
      (visitorIds ?? [])
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x) => x.length > 0)
    )
  );

  if (distinctVisitorIds.length > 0) {
    const settled = await Promise.allSettled(
      distinctVisitorIds.map((visitorId) => getFormationProfileByVisitorId(baseUrl, apiKey, visitorId))
    );

    const items = settled
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((item): item is FormationProfileListItem => item !== null);

    return {
      ok: true,
      items
    };
  }

  const response = await fetch(`${baseUrl}/formation/profiles?limit=200`, {
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
    .map((profile) => normalizeProfile(profile))
    .filter((item): item is FormationProfileListItem => item !== null);

  return {
    ok: true,
    items
  };
}

