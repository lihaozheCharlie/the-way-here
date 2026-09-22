/** Calendar days in the viewer's local timezone, including the first day. */
export function companionshipDays(startedAt: string | undefined, now = new Date()): number {
  const start = startedAt ? new Date(startedAt) : now;
  if (!Number.isFinite(start.getTime())) return 1;
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((day(now) - day(start)) / 86_400_000) + 1);
}
