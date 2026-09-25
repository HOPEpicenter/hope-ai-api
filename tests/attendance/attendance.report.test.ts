import { buildAttendanceAnalytics } from "../../src/domain/attendance/attendance.analytics";
import { getAttendanceCoaching } from "../../src/domain/attendance/attendance.coaching";
import { buildAttendanceInsights } from "../../src/domain/attendance/attendance.insights";
import { buildAttendanceRecommendation } from "../../src/domain/attendance/attendance.intelligence";
import { buildAttendanceMilestones } from "../../src/domain/attendance/attendance.milestones";
import { createInitialAttendanceProfile } from "../../src/domain/attendance/attendanceProfile.projection";
import { generateAttendanceJourneyReport } from "../../src/domain/attendance/attendance.report";
describe("Attendance report", () => { it("includes empty attendance data for a new member", () => { const profile = createInitialAttendanceProfile("member-1"); const insights = buildAttendanceInsights(profile); const report = generateAttendanceJourneyReport({ profile, timeline: [], milestones: buildAttendanceMilestones([]), coaching: getAttendanceCoaching(profile, buildAttendanceMilestones([]), insights, buildAttendanceRecommendation(profile, insights)), analytics: buildAttendanceAnalytics([profile]) }); expect(report.attendance.recorded).toBe(0); }); });