import { expect, it } from "vitest";
import { captureCalendarDate, captureTimeZone } from "./capture-dates.js";
it("uses the saving device's calendar day, including time zones crossing UTC dates", () => {
  expect(captureCalendarDate("2026-10-28T16:01:00Z", "Asia/Shanghai")).toBe("2026-10-29");
  expect(captureCalendarDate("2026-10-28T02:00:00Z", "America/Los_Angeles")).toBe("2026-10-27");
  expect(captureTimeZone("Asia/Shanghai")).toBe("Asia/Shanghai");
  expect(() => captureTimeZone("not/a/timezone")).toThrow("时区无效");
});
