export type DashboardActivityItem = {
  eventId: string;
  visitorId: string;
  type: string | null;
  occurredAt: string | null;
  stream: "engagement" | "formation";
  summary: string;
  data: Record<string, unknown>;
};

export type DashboardActivityResponse = {
  ok: boolean;
  items: DashboardActivityItem[];
  nextCursor: string | null;
};

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

export async function getGlobalActivity(limit = 20): Promise<DashboardActivityResponse> {
  const response = await fetch(
    `${getBaseUrl()}/api/dashboard/activity?limit=${encodeURIComponent(String(limit))}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`GET /api/dashboard/activity failed with status ${response.status}`);
  }

  const raw = (await response.json()) as {
    ok?: boolean;
    items?: any[];
    nextCursor?: string | null;
  };

  const items: DashboardActivityItem[] = Array.isArray(raw.items)
    ? raw.items.map((item: any) => ({
        eventId: String(item?.eventId ?? ""),
        visitorId: String(item?.visitorId ?? ""),
        type: item?.type ? String(item.type) : null,
        occurredAt: item?.occurredAt ? String(item.occurredAt) : null,
        stream: item?.stream === "formation" ? "formation" : "engagement",
        summary:
          typeof item?.summary === "string" && item.summary.trim().length > 0
            ? item.summary.trim()
            : (typeof item?.type === "string" ? item.type : "event"),
        data:
          item && typeof item.data === "object" && item.data !== null
            ? item.data
            : {}
      }))
    : [];

  return {
    ok: !!raw.ok,
    items,
    nextCursor: raw.nextCursor ?? null
  };
}
