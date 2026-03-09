import type { FollowupsResponse } from "@/lib/contracts/followups";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export async function getFollowups(): Promise<FollowupsResponse> {
  const opsBaseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("HOPE_API_KEY");

  const response = await fetch(`${opsBaseUrl}/ops/followups`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GET /ops/followups failed with status ${response.status}`);
  }

  const data = (await response.json()) as FollowupsResponse;

  if (data.ok !== true || !Array.isArray(data.items)) {
    throw new Error("Invalid /ops/followups response shape");
  }

  return data;
}
