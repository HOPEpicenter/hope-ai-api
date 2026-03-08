export type VisitorListItem = {
  visitorId: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisitorsResponse = {
  ok: boolean;
  items: VisitorListItem[];
};
