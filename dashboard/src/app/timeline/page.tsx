export const dynamic = "force-dynamic";

import { TimelinePageClient } from "@/components/timeline-page-client";
import { getTimeline } from "@/lib/loaders/get-timeline";

type TimelinePageProps = {
  searchParams?: Promise<{
    limit?: string;
    returnTo?: string;
  }>;
};

function clampLimit(value?: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  if (parsed <= 25) return 25;
  if (parsed <= 50) return 50;
  return 100;
}

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const limit = clampLimit(params?.limit);
  const returnTo = params?.returnTo ?? undefined;

  const timeline = await getTimeline(String(limit));

  return (
    <TimelinePageClient
      initialItems={timeline.items}
      initialNextCursor={timeline.nextCursor ?? null}
      initialPageSize={limit}
      initialVisitorId={null}
      returnTo={returnTo ?? null}
    />
  );
}

