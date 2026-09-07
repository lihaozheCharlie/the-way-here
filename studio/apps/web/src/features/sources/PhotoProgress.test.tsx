import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PhotoProgress } from "./PhotoProgress";

it("shows only the two current annotation steps", () => {
  const html = renderToStaticMarkup(<PhotoProgress step={3} onStep={vi.fn()} />);
  expect(html.match(/<button /g)).toHaveLength(2);
  expect(html).toContain('aria-current="step"');
  expect(html).toContain("2 讲故事");
  expect(html).not.toContain("确认讲述");
});
it("locks both destinations while saving or running", () => {
  const html = renderToStaticMarkup(<PhotoProgress step={3} disabled onStep={vi.fn()} />);
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
it("does not mark skipped identification as completed", () => {
  const html = renderToStaticMarkup(<PhotoProgress step={3} completed={[]} onStep={vi.fn()} />);
  expect(html).not.toContain('class="done"');
});
