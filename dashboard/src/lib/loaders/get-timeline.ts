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

export async function getTimeline(cursor?: string): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  params.set("limit", "50");

  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(
    `${getBaseUrl()}/api/dashboard/timeline/unified?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const errorMessage =
      typeof json?.error === "string"
        ? json.error
        : json?.error?.message || JSON.stringify(json?.error) || `Timeline request failed with status ${response.status}`;

    throw new Error(errorMessage);
  }

  return json as TimelineResponse;
}
