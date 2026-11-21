import type { DreamDateRange, DreamRun, DreamPointCandidate, DreamPointInput, DreamReport } from "@the-way-here/shared";
export { dreamTitle } from "@the-way-here/shared";

export const dreamActive = (run: DreamRun) => run.status === "queued" || run.status === "running";
export const dreamFinished = (run: DreamRun) => ["ready", "partial", "insufficient"].includes(run.status);
export const pointKey = (source: DreamPointCandidate["source"]) => source.kind + ":" + ("pageId" in source ? source.pageId : source.pointId);

export function dreamParagraphs(text: string): string[] {
  return text.trim().split(/\n+/).filter(Boolean).flatMap(paragraph => {
    const parts: string[] = [];
    let current = "";
    for (const sentence of paragraph.split(/(?<=[。！？])/u)) {
      if (current && current.length + sentence.length > 140) {
        parts.push(current.trim());
        current = "";
      }
      current += sentence;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  });
}

/** Interpolate undated nodes, then spread close dates within their lane in timeline order. */
export function spaceDreamNodes(desired: Array<number | undefined>, left: number, right: number, gap: number) {
  if (!desired.length) return [];
  const anchors = [{ index: -1, x: left }, ...desired.flatMap((x, index) => x === undefined ? [] : [{ index, x }]),
    { index: desired.length, x: right }];
  const distance = Math.min(gap, (right - left) / Math.max(1, desired.length - 1));
  const positions: number[] = [];
  let next = 1;
  for (let i = 0; i < desired.length; i++) {
    const before = anchors[next - 1]!;
    const after = anchors[next]!;
    const ideal = desired[i] ?? before.x + (after.x - before.x) * ((i - before.index) / (after.index - before.index));
    const lower = i === 0 ? left : positions[i - 1]! + distance;
    const upper = right - (desired.length - 1 - i) * distance;
    positions.push(Math.min(upper, Math.max(lower, ideal)));
    if (after.index === i) next++;
  }
  return positions;
}

function singleDateRange(value: string): DreamDateRange | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value.trim());
  if (!match) return;
  const [, year, month, day] = match;
  if (!month) return { earliest: year + "-01-01", latest: year + "-12-31" };
  if (Number(month) < 1 || Number(month) > 12) return;
  const end = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (day && (Number(day) < 1 || Number(day) > end)) return;
  return { earliest: year + "-" + month + "-" + (day || "01"), latest: year + "-" + month + "-" + (day || end) };
}

export function dateRange(value: string): DreamDateRange | undefined {
  const [from, to, extra] = value.split(/至|~|～|–|—/);
  const first = singleDateRange(from ?? "");
  if (to === undefined) return first;
  const last = singleDateRange(to);
  if (!extra && first && last && first.earliest <= last.latest) return { earliest: first.earliest, latest: last.latest };
}

export function pointInput(run: DreamRun): DreamPointInput {
  const { source, title: _title, stageStart: _start, ...settings } = run.point;
  return { ...source, ...settings };
}

type Hypothesis = DreamReport["branches"][number]["timeline"][number];
export type PathNode = { id: string; year?: number; label: string; text: string; entry?: Hypothesis; date?: string; evidence?: DreamReport["actualPath"]["evidence"]; };
export type DreamLane = { id: string; title: string; nodes: PathNode[] };

export function dreamLanes(run: DreamRun, report: DreamReport): DreamLane[] {
  const start = run.point.decisionAt.earliest;
  const real = report.actualTimeline?.filter(node => node.date >= start && node.finding.evidence.length)
    .sort((a, b) => a.date.localeCompare(b.date)) ?? [];
  return [{
    id: "actual", title: "现实",
    nodes: real.length ? real.map((node, i) => ({ id: "actual-" + i, year: Number(node.date.slice(0, 4)), label: node.date, text: node.finding.text, date: node.date, evidence: node.finding.evidence }))
      : report.actualPath.evidence.length ? [{ id: "actual-path", label: "真实路径", text: report.actualPath.text, evidence: report.actualPath.evidence }] : [],
  }, ...report.branches.map(branch => ({
    id: branch.id, title: branch.title,
    nodes: branch.timeline.map((entry, i) => {
      const year = entry.date ? Number(entry.date.slice(0, 4)) : Number(entry.horizon.match(/\b(?:19|20)\d{2}\b/)?.[0]);
      const bounded = Number.isFinite(year) && year >= Number(start.slice(0, 4)) && year <= Number((run.until ?? run.createdAt).slice(0, 4));
      return { id: branch.id + "-" + i, year: bounded ? year : undefined, label: entry.horizon, text: entry.review.revision ?? entry.possibility, entry, date: entry.date };
    }),
  }))];
}
