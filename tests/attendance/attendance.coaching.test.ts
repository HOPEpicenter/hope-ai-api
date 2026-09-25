import { getAttendanceCoaching } from "../../src/domain/attendance/attendance.coaching";
import { buildAttendanceInsights } from "../../src/domain/attendance/attendance.insights";
import { buildAttendanceRecommendation } from "../../src/domain/attendance/attendance.intelligence";
import { buildAttendanceMilestones } from "../../src/domain/attendance/attendance.milestones";
import { createInitialAttendanceProfile } from "../../src/domain/attendance/attendanceProfile.projection";
describe("Attendance coaching", () => { it("summarizes the attendance state", () => { const profile = createInitialAttendanceProfile("member-1"); const insights = buildAttendanceInsights(profile); expect(getAttendanceCoaching(profile, buildAttendanceMilestones([]), insights, buildAttendanceRecommendation(profile, insights)).attendanceSummary).toContain("0 attended"); }); });