import type { VisitorsResponse } from "@/lib/contracts/visitors";

export const mockVisitors: VisitorsResponse = {
  ok: true,
  items: [
    {
      visitorId: "visitor-1002",
      name: "John Visitor",
      email: "john.visitor@example.com",
      createdAt: "2026-03-06T13:15:00.000Z",
      updatedAt: "2026-03-07T15:45:00.000Z"
    },
    {
      visitorId: "visitor-1001",
      name: "Jane Visitor",
      email: "jane.visitor@example.com",
      createdAt: "2026-03-05T10:30:00.000Z",
      updatedAt: "2026-03-07T12:00:00.000Z"
    },
    {
      visitorId: "visitor-1000",
      name: "Sam Guest",
      email: null,
      createdAt: "2026-03-04T09:00:00.000Z",
      updatedAt: "2026-03-06T18:20:00.000Z"
    }
  ]
};
