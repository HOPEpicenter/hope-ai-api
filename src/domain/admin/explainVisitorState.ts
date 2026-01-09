import { computeFromProfile } from "../formation/computeFromProfile";

export type ExplainVisitorState = {
  visitorId: string | null;
  stage: string;
  needsFollowup: boolean;
  urgency: "OVERDUE" | "DUE_SOON" | "WATCH" | null;
  recommendedAction: string | null;
  reasons: string[];
  suppressions: string[];
  raw: any; // keep for debugging; UI can ignore
};

export function explainVisitorState(profile: any, now: Date): ExplainVisitorState {
  const computed: any = computeFromProfile(profile, now);

  // We intentionally support multiple shapes because computeFromProfile evolves.
  const visitorId =
    profile?.visitorId ??
    computed?.visitorId ??
    profile?.RowKey ??
    null;

  const stage =
    computed?.stage ??
    profile?.stage ??
    "Unknown";

  // urgency shape can differ; we normalize
  const urgency =
    computed?.urgency ??
    computed?.followupUrgency ??
    computed?.followup?.urgency ??
    computed?.followup?.candidate?.urgency ??
    null;

  const normalizedUrgency =
    urgency === "OVERDUE" || urgency === "DUE_SOON" || urgency === "WATCH" ? urgency : null;

  const recommendedAction =
    computed?.recommendedAction ??
    computed?.followup?.recommendedAction ??
    null;

  const reason =
    computed?.reason ??
    computed?.followup?.reason ??
    null;

  const reasons: string[] = [];
  if (reason) reasons.push(String(reason));

  // If computeFromProfile returns structured reasons/suppressions, surface them.
  const extraReasons =
    computed?.reasons ??
    computed?.followup?.reasons ??
    [];

  if (Array.isArray(extraReasons)) {
    for (const r of extraReasons) reasons.push(String(r));
  }

  const suppressions: string[] = [];
  const extraSuppressions =
    computed?.suppressions ??
    computed?.followup?.suppressions ??
    [];

  if (Array.isArray(extraSuppressions)) {
    for (const s of extraSuppressions) suppressions.push(String(s));
  }

  const needsFollowup = normalizedUrgency !== null;

  return {
    visitorId: visitorId ? String(visitorId) : null,
    stage: String(stage),
    needsFollowup,
    urgency: normalizedUrgency,
    recommendedAction: recommendedAction ? String(recommendedAction) : null,
    reasons,
    suppressions,
    raw: computed,
  };
}
