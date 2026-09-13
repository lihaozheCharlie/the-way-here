import { useEffect, useState } from "react";
export function useDesktopPreference(key: string, fallback = true) {
  const read = () => { const value = localStorage.getItem(key); return value === null ? fallback : value === "true"; };
  const [value, setValue] = useState(read);
  useEffect(() => {
    const refresh = () => setValue(read());
    window.addEventListener("storage", refresh);
    window.addEventListener("desktop-preference", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("desktop-preference", refresh); };
  }, [key, fallback]);
  const update = (next: boolean) => { localStorage.setItem(key, String(next)); setValue(next); window.dispatchEvent(new Event("desktop-preference")); };
  return [value, update] as const;
}
