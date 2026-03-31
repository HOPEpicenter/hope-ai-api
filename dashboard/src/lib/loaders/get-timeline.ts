import type { TimelineResponse } from "@/lib/contracts/timeline";

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

export async function getTimeline(before?: string): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  params.set("limit", "50");
  if (before) {
    params.set("before", before);
  }

  const response = await fetch(`${getBaseUrl()}/api/dashboard/timeline/unified?${params.toString()}`, {
    method: "GET",
    cache: "no-store"
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(json?.error || `Timeline request failed with status ${response.status}`);
  }

  return json as TimelineResponse;
}
