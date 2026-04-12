import type { VisitorsResponse } from "@/lib/contracts/visitors";

type RawVisitorItem = {
  visitorId?: unknown;
  id?: unknown;
  name?: unknown;
  email?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

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

  const response = await fetch(`${baseUrl}/api/visitors?limit=200`, {
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

  const data: unknown = await response.json();

  const candidate =
    typeof data === "object" && data !== null && "items" in data
      ? (data as { items?: unknown }).items
      : typeof data === "object" && data !== null && "visitors" in data
        ? (data as { visitors?: unknown }).visitors
        : data;

  const items: RawVisitorItem[] = Array.isArray(candidate)
    ? candidate as RawVisitorItem[]
    : [];

  const count =
    typeof data === "object" && data !== null && "count" in data && typeof (data as { count?: unknown }).count === "number"
      ? (data as { count: number }).count
      : items.length;

  return {
    ok: true,
    count,
    items: items.map((item) => ({
      visitorId: String(item.visitorId ?? item.id ?? ""),
      name: String(item.name ?? ""),
      email: typeof item.email === "string" ? item.email : null,
      createdAt: String(item.createdAt ?? ""),
      updatedAt: String(item.updatedAt ?? item.createdAt ?? "")
    }))
  };
}




