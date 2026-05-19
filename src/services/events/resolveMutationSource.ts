import { normalizeEventSource, type EventSource } from "./normalizeEventSource";

export type MutationSourceInput = {
  system?: unknown;
  actorId?: unknown;
  requestId?: unknown;
};

export function resolveMutationSource(input: MutationSourceInput): EventSource {
  return normalizeEventSource({
    system: input.system,
    actorId: input.actorId
  });
}