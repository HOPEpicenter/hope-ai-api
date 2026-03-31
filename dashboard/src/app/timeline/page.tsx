export const dynamic = "force-dynamic";

import { TimelinePageClient } from "@/components/timeline-page-client";
import { getTimeline } from "@/lib/loaders/get-timeline";

export default async function TimelinePage() {
  const data = await getTimeline();

  return (
    <TimelinePageClient
      initialItems={data.items}
      initialNextCursor={data.nextCursor ?? null}
    />
  );
}
