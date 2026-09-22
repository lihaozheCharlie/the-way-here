import { describe, expect, it } from "vitest";
import { companionshipDays } from "./companionship";
describe("companionship calendar days", () => {
  it("includes the first day and crosses midnight rather than waiting 24 hours", () => {
    expect(companionshipDays(new Date(2026, 8, 21, 23, 59).toISOString(), new Date(2026, 8, 22, 0, 1))).toBe(2);
    expect(companionshipDays(new Date(2026, 8, 22).toISOString(), new Date(2026, 8, 22, 12))).toBe(1);
  });
  it("handles leap days, future timestamps and missing legacy fields", () => {
    expect(companionshipDays(new Date(2024, 1, 28).toISOString(), new Date(2024, 2, 1))).toBe(3);
    for (const start of [undefined, "invalid", "2099-01-01"]) expect(companionshipDays(start, new Date(2026, 8, 22))).toBe(1);
  });
});
