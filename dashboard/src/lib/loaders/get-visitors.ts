import type { VisitorsResponse } from "@/lib/contracts/visitors";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export async function getVisitors(): Promise<VisitorsResponse> {
  const baseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("HOPE_API_KEY");

  const response = await fetch(`${baseUrl}/api/visitors`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GET /api/visitors failed with status ${response.status}`);
  }

  const data = await response.json();

  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.visitors)
      ? data.visitors
      : Array.isArray(data)
        ? data
        : [];

  return {
    ok: true,
    items: items.map((item: any) => ({
      visitorId: String(item.visitorId ?? item.id ?? ""),
      name: String(item.name ?? ""),
      email: item.email ?? null,
      createdAt: String(item.createdAt ?? ""),
      updatedAt: String(item.updatedAt ?? item.createdAt ?? "")
    }))
  };
}
