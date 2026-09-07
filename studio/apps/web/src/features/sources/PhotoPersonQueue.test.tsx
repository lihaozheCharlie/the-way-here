import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { PhotoMemory } from "@the-way-here/shared";
import { PhotoPersonQueue } from "./PhotoPersonQueue";

const memory = { id: "memory", knowledgeBaseId: "demo", title: "测试照片", reportPath: "sources/photo.md", revision: 1, createdAt: "2026-09-05", draft: "", confirmedStory: "", photos: [{
  id: "photo-1", name: "group.jpg", width: 1200, height: 800,
  people: [{ id: "face-1", name: "", useAsAvatar: true, box: { x: .2, y: .2, width: .25, height: .35 } }],
}] } as PhotoMemory;

const props = {
  memory, drafts: {}, groups: [], selectedId: "face-1", photoId: "photo-1", people: [], locked: false,
  onDetach: vi.fn(), onSelect: vi.fn(), onPhoto: vi.fn(), onChange: vi.fn(), onAdd: vi.fn(), onConfirm: vi.fn(), onCommitBox: vi.fn(), onSkip: vi.fn(),
  detecting: false, onRetry: vi.fn(),
};

it("selects a face for box adjustment without opening the person form", () => {
  const html = renderToStaticMarkup(<PhotoPersonQueue {...props} />);
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('photo-face-tag unassigned selected');
  expect(html).not.toContain('photo-face-tag empty');
  expect(html).toContain("填写人物");
  expect(html).not.toContain("调整圈选范围");
  expect(html).not.toContain("photo-person-inspector");
  expect(html).not.toContain('role="combobox"');
});

it("does not show an instruction panel before a face is selected", () => {
  const html = renderToStaticMarkup(<PhotoPersonQueue {...props} selectedId="" />);
  expect(html).not.toContain("圈选与标注");
  expect(html).not.toContain("photo-person-inspector");
});
