import { buildAttendanceInsights } from "../../src/domain/attendance/attendance.insights";
import { buildAttendanceRecommendation } from "../../src/domain/attendance/attendance.intelligence";
import { createInitialAttendanceProfile } from "../../src/domain/attendance/attendanceProfile.projection";
describe("Attendance intelligence", () => { it("recommends no action without records", () => { const profile = createInitialAttendanceProfile("member-1"); expect(buildAttendanceRecommendation(profile, buildAttendanceInsights(profile)).action).toBe("no_recommendation"); }); });