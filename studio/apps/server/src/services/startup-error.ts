/** User-facing startup diagnostics must never include parser excerpts or credentials. */
export function startupErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/全局 Agent 设置|桌面密钥保护通道|钥匙串/.test(message)) {
    return "AI 设置暂时无法读取，请确认系统钥匙串可用后重新打开应用。现有设置和知识内容已保留；更换知识空间无法解决此问题。";
  }
  return "知识空间初始化未完成，请重新打开应用；若问题持续，请联系支持。现有知识内容已保留。";
}
