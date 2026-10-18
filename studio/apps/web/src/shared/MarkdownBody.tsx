import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReturnContext } from "./routing";
import { markdownWithoutFrontmatter } from "./document-model";
import { NoteProperties } from "./DocumentProperties";

export function MarkdownBody({ children, headingPrefix, properties }: { children: string; headingPrefix?: string; properties?: Record<string, unknown> }) {
  const returnContext = useReturnContext();
  const location = useLocation();
  useEffect(() => {
    if (!headingPrefix || !location.hash) return;
    let target: string;
    try { target = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const frame = requestAnimationFrame(() => {
      const headings = [...document.querySelectorAll<HTMLElement>(`[id^="${headingPrefix}-heading-"]`)];
      headings.find((heading) => heading.textContent?.trim() === target || heading.id === target)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [children, headingPrefix, location.hash]);
  const markdown = markdownWithoutFrontmatter(children);
  const hasProperties = Boolean(properties && Object.keys(properties).length);
  const hasLevelOneHeading = /^#\s+.+$/m.test(markdown);
  let propertiesRendered = false;
  let headingIndex = 0;
  const nextHeadingId = () => headingPrefix ? `${headingPrefix}-heading-${headingIndex++}` : undefined;
  return <>{hasProperties && !hasLevelOneHeading ? <NoteProperties properties={properties!} /> : null}<ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children: label }) => href?.startsWith("/page/") ? <NavLink to={href} state={returnContext}>{label}</NavLink> : <a href={href} target="_blank" rel="noreferrer">{label}</a>,
    p: ({ node, children }) => <p data-source-line={node?.position?.start.line}>{children}</p>,
    li: ({ node, children, ...props }) => <li {...props} data-source-line={node?.position?.start.line}>{children}</li>,
    pre: ({ node, children }) => <pre data-source-line={node?.position?.start.line}>{children}</pre>,
    blockquote: ({ node, children }) => <blockquote data-source-line={node?.position?.start.line}>{children}</blockquote>,
    table: ({ node, children }) => <table data-source-line={node?.position?.start.line}>{children}</table>,
    h1: ({ node, children: label }) => {
      const showProperties = hasProperties && !propertiesRendered;
      propertiesRendered = propertiesRendered || showProperties;
      return <><h1 data-source-line={node?.position?.start.line} id={nextHeadingId()}>{label}</h1>{showProperties ? <NoteProperties properties={properties!} /> : null}</>;
    },
    h2: ({ node, children: label }) => <h2 data-source-line={node?.position?.start.line} id={nextHeadingId()}>{label}</h2>,
    h3: ({ node, children: label }) => <h3 data-source-line={node?.position?.start.line} id={nextHeadingId()}>{label}</h3>,
    h4: ({ node, children: label }) => <h4 data-source-line={node?.position?.start.line} id={nextHeadingId()}>{label}</h4>,
  }}>{markdown}</ReactMarkdown></>;
}
