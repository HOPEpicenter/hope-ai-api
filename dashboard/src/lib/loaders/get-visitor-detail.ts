import type { VisitorDetailResponse } from "@/lib/contracts/visitor-detail";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function getJson(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }

  return response.json();
}

export async function getVisitorDetail(visitorId: string): Promise<VisitorDetailResponse> {
  const baseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("HOPE_API_KEY");

  const [visitorData, profileData] = await Promise.all([
    getJson(`${baseUrl}/api/visitors/${encodeURIComponent(visitorId)}`, apiKey),
    getJson(`${baseUrl}/api/visitors/${encodeURIComponent(visitorId)}/formation/profile`, apiKey)
  ]);

  const visitor = visitorData?.visitor ?? visitorData;

  return {
    ok: true,
    visitor: {
      visitorId: String(visitor?.visitorId ?? visitor?.id ?? visitorId),
      name: String(visitor?.name ?? ""),
      email: visitor?.email ?? null,
      createdAt: String(visitor?.createdAt ?? ""),
      updatedAt: String(visitor?.updatedAt ?? visitor?.createdAt ?? "")
    },
    formationProfile: profileData?.profile
      ? {
          partitionKey: String(profileData.profile.partitionKey ?? "VISITOR"),
          rowKey: String(profileData.profile.rowKey ?? visitorId),
          stage: profileData.profile.stage ?? null,
          assignedTo: profileData.profile.assignedTo ?? null,
          lastFollowupAssignedAt: profileData.profile.lastFollowupAssignedAt ?? null,
          lastFollowupContactedAt: profileData.profile.lastFollowupContactedAt ?? null,
          lastFollowupOutcomeAt: profileData.profile.lastFollowupOutcomeAt ?? null,
          lastFollowupOutcome: profileData.profile.lastFollowupOutcome ?? null,
          lastFollowupOutcomeNotes: profileData.profile.lastFollowupOutcomeNotes ?? null,
          lastEventType: profileData.profile.lastEventType ?? null,
          lastEventAt: profileData.profile.lastEventAt ?? null,
          updatedAt: profileData.profile.updatedAt ?? null
        }
      : null
  };
}

