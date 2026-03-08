import type { OverviewResponse } from "@/lib/contracts/overview";

export const mockOverview: OverviewResponse = {
  ok: true,
  stats: [
    {
      label: "Open Followups",
      value: 2,
      helper: "Assigned items still needing attention"
    },
    {
      label: "Visitors",
      value: 3,
      helper: "Current mock visitor directory size"
    },
    {
      label: "Timeline Events",
      value: 3,
      helper: "Recent integrated activity items"
    },
    {
      label: "Profiles With Stage",
      value: 2,
      helper: "Visitors with a formation profile snapshot"
    }
  ],
  recent: [
    {
      title: "Followups queue",
      subtitle: "2 open items need review",
      href: "/followups"
    },
    {
      title: "John Visitor",
      subtitle: "Latest visitor activity recorded in mock detail view",
      href: "/visitors/visitor-1002"
    },
    {
      title: "Timeline",
      subtitle: "Recent formation and engagement events",
      href: "/timeline"
    }
  ]
};
