export const dynamic = "force-dynamic";

import { TimelinePageClient } from "@/components/timeline-page-client";
import { getGlobalActivity } from "@/lib/loaders/get-global-activity";

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

  const activity = await getGlobalActivity(limit);

  return (
    <TimelinePageClient
      initialItems={activity.items}
      initialNextCursor={activity.nextCursor ?? null}
      initialPageSize={limit}
      initialVisitorId={null}
      returnTo={returnTo ?? null}
    />
  );
}
