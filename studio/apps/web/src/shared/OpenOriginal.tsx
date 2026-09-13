import { useState } from "react";
import { api } from "../api";
export function OpenOriginal({ pageId }: { pageId: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <><button type="button" className="open-original" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { await api("/api/files/reveal", { method:"POST", body:JSON.stringify({pageId}) }); }
    catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  }}>{busy ? "正在打开…" : "在原文件中显示"}</button>{error ? <span role="alert">{error}</span> : null}</>;
}
