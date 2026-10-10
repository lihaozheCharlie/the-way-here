import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SourceFolderSummary } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import "./source-folder-tree.css";

export type SourceFolderTreeNode = { path: string; name: string; count: number; absolutePath?: string; external: boolean; children: SourceFolderTreeNode[] };

export function buildSourceFolderTree(paths: string[], summaries: SourceFolderSummary[] | undefined, counts: Map<string, number>): SourceFolderTreeNode[] {
  const known = new Set(paths);
  const nodes = new Map<string, SourceFolderTreeNode>();
  for (const path of paths) {
    const summary = summaries?.find((item) => item.path === path);
    nodes.set(path, { path, name: summary?.label || path.split("/").at(-1) || path, count: counts.get(path) || 0, absolutePath: summary?.absolutePath, external: Boolean(summary?.external), children: [] });
  }
  const roots: SourceFolderTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "";
    if (parent && known.has(parent)) nodes.get(parent)!.children.push(node);
    else roots.push(node);
  }
  const sort = (list: SourceFolderTreeNode[]) => { list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")); list.forEach((item) => sort(item.children)); };
  sort(roots);
  return roots;
}

function ancestorsOf(path: string) {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

export function SourceFolderTree({ roots, selected, totalCount, onSelect, renderMenu }: {
  roots: SourceFolderTreeNode[];
  selected: string;
  totalCount: number;
  onSelect: (path: string) => void;
  renderMenu?: (node: SourceFolderTreeNode) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(roots.map((node) => node.path)));
  const seenRoots = useMemo(() => roots.map((node) => node.path).join("\n"), [roots]);
  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const root of roots) next.add(root.path);
      for (const path of ancestorsOf(selected)) next.add(path);
      return next.size === current.size ? current : next;
    });
  }, [selected, seenRoots]);

  const toggle = (path: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const renderNode = (node: SourceFolderTreeNode, depth: number): ReactNode => {
    const hasChildren = node.children.length > 0;
    const open = expanded.has(node.path);
    const active = selected === node.path;
    return <li key={node.path} role="treeitem" aria-level={depth + 1} aria-selected={active} aria-expanded={hasChildren ? open : undefined}>
      <div className={`folder-tree-row${active ? " active" : ""}`} style={{ "--depth": depth } as React.CSSProperties}>
        {hasChildren
          ? <button type="button" className={`folder-tree-chevron${open ? " open" : ""}`} aria-label={`${open ? "收起" : "展开"}${node.name}`} onClick={() => toggle(node.path)}><Icon name="down" size={13} /></button>
          : <span className="folder-tree-chevron placeholder" aria-hidden="true" />}
        <button type="button" className="folder-tree-label" title={node.absolutePath || node.path} onClick={() => { onSelect(node.path); if (hasChildren && !open) toggle(node.path); }}>
          <Icon name="folder" size={15} />
          <span>{node.name}</span>
          <small>{node.count}</small>
        </button>
        {renderMenu?.(node)}
      </div>
      {hasChildren && open ? <ul role="group">{node.children.map((child) => renderNode(child, depth + 1))}</ul> : null}
    </li>;
  };

  return <ul className="folder-tree" role="tree" aria-label="磁盘文件夹">
    <li role="treeitem" aria-selected={!selected}>
      <div className={`folder-tree-row all${!selected ? " active" : ""}`} style={{ "--depth": 0 } as React.CSSProperties}>
        <span className="folder-tree-chevron placeholder" aria-hidden="true" />
        <button type="button" className="folder-tree-label" onClick={() => onSelect("")}><Icon name="source" size={15} /><span>全部材料</span><small>{totalCount}</small></button>
      </div>
    </li>
    {roots.map((node) => renderNode(node, 0))}
  </ul>;
}
