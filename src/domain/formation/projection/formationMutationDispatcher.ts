export type FormationMutationDispatchArgs = {
  type: string;
  profile: Record<string, any>;
  data: Record<string, any>;
  occurredAtIso: string;
  eventId: string;
};

export type FormationMutationDispatcher =
  (args: FormationMutationDispatchArgs) => Promise<void> | void;
