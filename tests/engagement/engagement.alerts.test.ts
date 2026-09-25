import { buildEngagementAlerts } from "../../src/domain/engagement/engagement.alerts";
import { buildEngagementInsights } from "../../src/domain/engagement/engagement.insights";
import { createInitialEngagementProfile } from "../../src/domain/engagement/engagementProfile.projection";
describe("engagement alerts", () => { it("returns no alerts for an empty profile", () => { const profile = createInitialEngagementProfile("m"); expect(buildEngagementAlerts(profile, buildEngagementInsights(profile))).toEqual([]); }); });