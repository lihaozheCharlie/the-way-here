import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WikiPage } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { apiPageHref } from "../../shared/routing";
import { ReadOnlyDocument } from "../../shared/markdown";
import { Empty, Icon, Loading } from "../../shared/ui";
import "./read-only-page-dialog.css";

export function ReadOnlyPageDialog({ pageId, revision, onClose }: { pageId: string; revision: number; onClose: () => void }) {
  const [currentId, setCurrentId] = useState(pageId);
  const dialog = useRef<HTMLDialogElement>(null);
  const { data, loading, error } = useApi<WikiPage>(apiPageHref(currentId), revision);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="stage-document-dialog" aria-label="只读文件预览" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header><span>只读预览</span><button type="button" autoFocus aria-label="关闭文件预览" onClick={onClose}><Icon name="close" size={18} /></button></header>
    <div className="stage-document-scroll" onClickCapture={event => {
      const anchor = (event.target as Element).closest('a');
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const id = url.pathname.startsWith('/page/') ? decodeURIComponent(url.pathname.slice(6)) : url.pathname === '/letters' ? url.searchParams.get('letter') : undefined;
      if (id) { event.preventDefault(); event.stopPropagation(); setCurrentId(id); event.currentTarget.scrollTop = 0; }
    }}>
      {loading ? <Loading label="正在读取文件" /> : error || !data ? <Empty>{error || "文件暂时无法读取"}</Empty> : <ReadOnlyDocument key={data.id} id={data.id} page={data} markdown={data.renderedMarkdown} showOutline={false} />}
    </div>
  </dialog>, document.body);
}
