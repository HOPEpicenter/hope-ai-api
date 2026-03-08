export type VisitorDetail = {
  visitorId: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisitorFormationProfile = {
  partitionKey: string;
  rowKey: string;
  stage: string | null;
  lastEventType: string | null;
  lastEventAt: string | null;
  updatedAt: string | null;
};

export type VisitorDetailResponse = {
  ok: boolean;
  visitor: VisitorDetail;
  formationProfile: VisitorFormationProfile | null;
};
