import type { VisitorsResponse } from "@/lib/contracts/visitors";

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

export async function getVisitors(): Promise<VisitorsResponse> {
  const response = await fetch(`${getBaseUrl()}/api/dashboard/visitors?limit=200`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GET /api/dashboard/visitors failed with status ${response.status}`);
  }

  const data: unknown = await response.json();
  return data as VisitorsResponse;
}
