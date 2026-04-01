import type { TimelineResponse } from "@/lib/contracts/timeline";

function getBaseUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!value) {
    return "http://127.0.0.1:3001";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }

  return `https://${value.replace(/\/+$/, "")}`;
}

export async function getTimeline(limit = 50): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

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
