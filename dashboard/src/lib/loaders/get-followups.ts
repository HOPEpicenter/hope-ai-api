import type { FollowupsResponse } from "@/lib/contracts/followups";
import {
  getCanonicalFollowupStatus
} from "@/lib/followup-utils";

type RawFormationProfile = {
  visitorId?: unknown;
  rowKey?: unknown;
  assignedTo?: unknown;
  stage?: unknown;
  lastFollowupAssignedAt?: unknown;
  lastFollowupContactedAt?: unknown;
  lastFollowupOutcomeAt?: unknown;
  lastFollowupOutcome?: unknown;
};

type RawFormationProfilesResponse = {
  ok?: unknown;
  items?: unknown;
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

function toMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export async function getFollowups(): Promise<FollowupsResponse> {
  const baseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("HOPE_API_KEY");

  const allProfiles: RawFormationProfile[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < 10; i++) {
    const url = cursor
      ? `${baseUrl}/api/formation/profiles?cursor=${encodeURIComponent(cursor)}`
      : `${baseUrl}/api/formation/profiles`;

    const response = await fetch(url, {
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

    const data = (await response.json()) as RawFormationProfilesResponse & { cursor?: string };

    if (data.ok !== true || !Array.isArray(data.items)) {
      throw new Error("Invalid /api/formation/profiles response shape");
    }

    allProfiles.push(...(data.items as RawFormationProfile[]));

    if (!data.cursor) {
      break;
    }

    cursor = data.cursor;
  }

  const items = allProfiles
    .map((profile) => {
      const visitorId =
        typeof profile.visitorId === "string" && profile.visitorId.trim().length > 0
          ? profile.visitorId.trim()
          : typeof profile.rowKey === "string" && profile.rowKey.trim().length > 0
            ? profile.rowKey.trim()
            : "";

      const assignedToRaw =
        typeof profile.assignedTo === "string" ? profile.assignedTo.trim() : "";

      const lastFollowupAssignedAt = toIsoOrNull(profile.lastFollowupAssignedAt);
      const lastFollowupContactedAt = toIsoOrNull(profile.lastFollowupContactedAt);
      const lastFollowupOutcomeAt = toIsoOrNull(profile.lastFollowupOutcomeAt);
      const lastFollowupOutcome =
        typeof profile.lastFollowupOutcome === "string" && profile.lastFollowupOutcome.trim().length > 0
          ? profile.lastFollowupOutcome.trim()
          : null;

      const assignedAtMs = toMs(lastFollowupAssignedAt);
      const contactedAtMs = toMs(lastFollowupContactedAt);
      const outcomeAtMs = toMs(lastFollowupOutcomeAt);

      if (!visitorId || assignedAtMs === null) {
        return null;
      }

      const followupStatus = getCanonicalFollowupStatus({
        assignedAt: lastFollowupAssignedAt,
        contactedAt: lastFollowupContactedAt,
        outcomeAt: lastFollowupOutcomeAt
      });

      const resolvedForAssignment = followupStatus === "Resolved";

      if (resolvedForAssignment) {
        return null;
      }

      const needsFollowup = followupStatus === "Assigned";

      return {
        visitorId,
        assignedTo: assignedToRaw
          ? {
              ownerType: "user" as const,
              ownerId: assignedToRaw
            }
          : null,
        lastFollowupAssignedAt,
        lastFollowupContactedAt,
        lastFollowupOutcomeAt,
        lastFollowupOutcome,
        resolvedForAssignment,
        stage: typeof profile.stage === "string" ? profile.stage : null,
        needsFollowup
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => {
      const leftAssignedAt = toMs(left.lastFollowupAssignedAt) ?? 0;
      const rightAssignedAt = toMs(right.lastFollowupAssignedAt) ?? 0;

      if (leftAssignedAt !== rightAssignedAt) {
        return rightAssignedAt - leftAssignedAt;
      }

      return left.visitorId.localeCompare(right.visitorId);
    });

  return {
    ok: true,
    items
  };
}

