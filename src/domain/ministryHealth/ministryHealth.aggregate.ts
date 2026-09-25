export type MinistryHealthDomain = "formation" | "care" | "serving" | "community" | "giving" | "attendance" | "engagement";
export type MinistryHealthInputs = Partial<Record<`${MinistryHealthDomain}Analytics`, unknown>>;
export type MinistryHealthScore = { domain: MinistryHealthDomain; score: number; available: boolean; reasons: string[] };
export type MinistryHealthAlert = { severity: "info" | "warning" | "critical"; domain: MinistryHealthDomain; message: string };
export type MinistryHealthTrend = { domain: MinistryHealthDomain; direction: "improving" | "stable" | "declining" | "insufficient_data"; value: number | null };
export type MinistryHealthAggregate = { generatedAt: string; ministryHealthSummary: { status: "healthy" | "watch" | "attention"; overallScore: number; domainsAvailable: number; domainsTotal: number; alertCount: number }; ministryHealthScores: MinistryHealthScore[]; ministryHealthAlerts: MinistryHealthAlert[]; ministryHealthTrends: MinistryHealthTrend[]; sources: Record<MinistryHealthDomain, Record<string, unknown>> };

const domains: MinistryHealthDomain[] = ["formation", "care", "serving", "community", "giving", "attendance", "engagement"];
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const numberAt = (source: Record<string, unknown>, names: string[]): number | null => { for (const name of names) { const value = source[name]; if (typeof value === "number" && Number.isFinite(value)) return value; } return null; };
const ratioAt = (source: Record<string, unknown>, names: string[]): number | null => { const value = numberAt(source, names); return value === null ? null : Math.max(0, Math.min(1, value)); };

function scoreDomain(domain: MinistryHealthDomain, source: Record<string, unknown>): MinistryHealthScore {
  if (Object.keys(source).length === 0) return { domain, score: 0, available: false, reasons: ["No source analytics available."] };
  const completion = ratioAt(source, ["completionRate", "pathwayCompletionRate", "closureRate"]);
  const stalled = numberAt(source, ["stalledCycles", "stalledCases", "stalledPathwayCount", "overdue", "atRisk"]) ?? 0;
  const total = numberAt(source, ["totalMembers", "totalCycles", "totalCases", "totalPathwaysStarted", "totalProfiles"]) ?? 0;
  const base = completion === null ? 70 : Math.round(completion * 100);
  const penalty = total > 0 ? Math.min(40, Math.round((stalled / total) * 100)) : stalled > 0 ? 40 : 0;
  const score = Math.max(0, Math.min(100, base - penalty));
  const reasons = completion === null ? ["Completion metric unavailable; baseline score applied."] : [`Completion metric: ${Math.round(completion * 100)}%.`];
  if (stalled > 0) reasons.push(`${stalled} stalled or at-risk item(s).`);
  return { domain, score, available: true, reasons };
}

export function buildMinistryHealthAggregate(inputs: MinistryHealthInputs, generatedAt = new Date().toISOString()): MinistryHealthAggregate {
  const sources = Object.fromEntries(domains.map(domain => [domain, asRecord(inputs[`${domain}Analytics`])])) as Record<MinistryHealthDomain, Record<string, unknown>>;
  const ministryHealthScores = domains.map(domain => scoreDomain(domain, sources[domain]));
  const ministryHealthAlerts: MinistryHealthAlert[] = ministryHealthScores.flatMap((score): MinistryHealthAlert[] => !score.available ? [] : score.score < 40 ? [{ severity: "critical", domain: score.domain, message: `${score.domain} health is below 40.` }] : score.score < 70 ? [{ severity: "warning", domain: score.domain, message: `${score.domain} health needs attention.` }] : []);
  const ministryHealthTrends = ministryHealthScores.map(score => ({ domain: score.domain, direction: !score.available ? "insufficient_data" as const : score.score < 50 ? "declining" as const : score.score >= 80 ? "improving" as const : "stable" as const, value: score.available ? score.score : null }));
  const available = ministryHealthScores.filter(score => score.available);
  const overallScore = available.length ? Math.round(available.reduce((sum, score) => sum + score.score, 0) / available.length) : 100;
  return { generatedAt, ministryHealthSummary: { status: ministryHealthAlerts.some(alert => alert.severity === "critical") ? "attention" : ministryHealthAlerts.length ? "watch" : "healthy", overallScore, domainsAvailable: available.length, domainsTotal: domains.length, alertCount: ministryHealthAlerts.length }, ministryHealthScores, ministryHealthAlerts, ministryHealthTrends, sources };
}