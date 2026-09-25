export function isPublicEngagementEventsEnabled(): boolean {
  return (process.env.FEATURE_PUBLIC_ENGAGEMENT_EVENTS ?? "").trim().toLowerCase() === "true";
}
