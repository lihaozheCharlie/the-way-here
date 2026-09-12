let windowKnowledgeBaseId: string | undefined;
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (windowKnowledgeBaseId && init?.method && init.method !== "GET") headers.set("X-TWH-Knowledge-Base", windowKnowledgeBaseId);
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  if (url === "/api/vault" && !init?.method && typeof data.knowledgeBaseId === "string" && !windowKnowledgeBaseId) windowKnowledgeBaseId = data.knowledgeBaseId;
  return data as T;
}
