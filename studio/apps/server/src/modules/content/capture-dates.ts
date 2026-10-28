import { ContentRequestError } from "./page-writer.js";
export function captureTimeZone(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 100) throw new ContentRequestError(400, "时区无效");
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { throw new ContentRequestError(400, "时区无效"); }
}
export function captureCalendarDate(instant: Date | string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", day: "2-digit", ...(timeZone ? { timeZone } : {}) }).formatToParts(new Date(instant));
  const value = (name: string) => parts.find(part => part.type === name)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
