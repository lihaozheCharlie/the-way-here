import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PhotoProgress } from "./PhotoProgress";

it("exposes five keyboard-accessible steps and marks the current destination", () => {
  const html = renderToStaticMarkup(<PhotoProgress step={4} onStep={vi.fn()} />);
  expect(html.match(/<button /g)).toHaveLength(5);
  expect(html).toContain('aria-current="step"');
  expect(html).toContain("4 确认讲述");
  expect(html).not.toContain("disabled");
});
it("locks navigation while a save or run owns the memory", () => {
  const html = renderToStaticMarkup(<PhotoProgress step={5} disabled onStep={vi.fn()} />);
  expect(html.match(/disabled=""/g)).toHaveLength(5);
});
it("marks only completed work rather than every step before the destination", () => {
  const html = renderToStaticMarkup(<PhotoProgress step={5} completed={[1, 3]} onStep={vi.fn()} />);
  expect(html.match(/class="done"/g)).toHaveLength(2);
  expect(html).toContain('<li class=""><button type="button"><span aria-hidden="true"></span><b>2 认人物</b>');
});
