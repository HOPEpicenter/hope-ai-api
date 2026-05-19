export type EventSource = {
  system: string;
  actorId?: string;
};

export function normalizeEventSource(input: unknown): EventSource {
  const source =
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};

  const system =
    typeof source.system === "string" &&
    source.system.trim().length > 0
      ? source.system.trim()
      : "unknown";

  const actorId =
    typeof source.actorId === "string" &&
    source.actorId.trim().length > 0
      ? source.actorId.trim()
      : undefined;

  return actorId
    ? { system, actorId }
    : { system };
}