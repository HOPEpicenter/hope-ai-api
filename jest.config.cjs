/** @type {import("jest").Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/formation/formation.*.test.ts", "**/care/care.*.test.ts", "**/serving/serving.*.test.ts", "**/community/community.*.test.ts", "**/giving/giving.*.test.ts", "**/attendance/attendance.*.test.ts", "**/engagement/engagement.*.test.ts", "**/ministryHealth/ministryHealth.*.test.ts", "**/aiModeling/ai.*.test.ts", "**/predictiveIntelligence/predictive.*.test.ts", "**/memberJourney/memberJourney.*.test.ts", "**/workloadOptimization/workload.*.test.ts", "**/pastoralBriefing/pastoralBriefing.*.test.ts"],
  clearMocks: true,
};
