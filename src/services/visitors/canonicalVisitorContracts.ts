import type { CanonicalVisitorNarrative } from "../narratives/canonicalNarrativeContracts";

export type CanonicalVisitorSummary = {
  ok: true;
  v: 1;
  visitorId: string;
  summary: CanonicalVisitorNarrative;
};
