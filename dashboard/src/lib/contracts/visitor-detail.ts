export type VisitorDetail = {
  visitorId: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisitorFormationOwner = {
  ownerType: string;
  ownerId: string;
};

export type VisitorFormationProfile = {
  partitionKey: string;
  rowKey: string;
  stage: string | null;
  assignedTo: VisitorFormationOwner | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupContactedAt: string | null;
  lastFollowupOutcomeAt: string | null;
  lastFollowupOutcome: string | null;
  lastFollowupOutcomeNotes: string | null;
  lastEventType: string | null;
  lastEventAt: string | null;
  updatedAt: string | null;
};

export type VisitorDetailResponse = {
  ok: boolean;
  visitor: VisitorDetail;
  formationProfile: VisitorFormationProfile | null;
};

