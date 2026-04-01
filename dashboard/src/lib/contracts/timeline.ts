export type TimelineItem = {
  eventId: string;
  occurredAt: string;
  stream: "engagement" | "formation";
  type: string;
  summary: string | null;
  source?: {
    system?: string;
  } | null;
};

export type TimelineResponse = {
  ok: boolean;
  items: TimelineItem[];
  nextCursor: string | null;
};
