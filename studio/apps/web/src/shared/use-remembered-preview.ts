import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const previews = new Map<string, string>();
const openWindows = new Set<string>();

/** A preview belongs to the menu/page where it was opened, even after navigation. */
export function useRememberedPreview(slot: string) {
  const { pathname } = useLocation();
  const key = `${pathname}:${slot}`;
  const [selection, setSelection] = useState<{ key: string; id?: string }>(() => ({ key, id: previews.get(key) }));
  const [suspendedKey, setSuspendedKey] = useState<string>();
  useEffect(() => setSuspendedKey(undefined), [key]);
  useEffect(() => {
    const suspend = () => setSuspendedKey(key);
    window.addEventListener("suspend-floating-windows", suspend);
    return () => window.removeEventListener("suspend-floating-windows", suspend);
  }, [key]);
  const pageId = suspendedKey === key ? undefined : selection.key === key ? selection.id : previews.get(key);
  const open = (id: string) => { previews.set(key, id); setSelection({ key, id }); setSuspendedKey(undefined); };
  const close = () => { previews.delete(key); setSelection({ key, id: undefined }); };
  return { pageId, open, close };
}

export function useRememberedWindow(slot: string) {
  const { pathname } = useLocation();
  const key = `${pathname}:${slot}`;
  const [selection, setSelection] = useState<{ key: string; open: boolean }>(() => ({ key, open: openWindows.has(key) }));
  const [suspendedKey, setSuspendedKey] = useState<string>();
  useEffect(() => setSuspendedKey(undefined), [key]);
  useEffect(() => {
    const suspend = () => setSuspendedKey(key);
    window.addEventListener("suspend-floating-windows", suspend);
    return () => window.removeEventListener("suspend-floating-windows", suspend);
  }, [key]);
  const open = suspendedKey === key ? false : selection.key === key ? selection.open : openWindows.has(key);
  return {
    open,
    show: () => { openWindows.add(key); setSelection({ key, open: true }); setSuspendedKey(undefined); },
    hide: () => { openWindows.delete(key); setSelection({ key, open: false }); },
  };
}
