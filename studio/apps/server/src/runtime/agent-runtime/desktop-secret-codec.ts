import { randomUUID } from "node:crypto";

export interface SecretCodec {
  encrypt(text: string): Promise<string>;
  decrypt(text: string): Promise<string>;
}

type ParentPort = {
  on(event: "message", listener: (event: { data: any }) => void): void;
  off(event: "message", listener: (event: { data: any }) => void): void;
  postMessage(message: unknown): void;
};

// Only the signed main process uses safeStorage/Keychain. Renderers never get this port.
export function desktopSecretCodec(): SecretCodec | undefined {
  if (process.env.TWH_DESKTOP_SECURE_SETTINGS !== "1") return undefined;
  const port = (process as typeof process & { parentPort?: ParentPort }).parentPort;
  if (!port) throw new Error("桌面密钥保护通道不可用，未降级为明文存储");
  const request = (operation: "encrypt" | "decrypt", text: string) => new Promise<string>((resolve, reject) => {
    const id = randomUUID();
    const finish = (error?: Error, result?: string) => {
      clearTimeout(timer); port.off("message", onMessage);
      if (error) reject(error); else resolve(result!);
    };
    const onMessage = ({ data }: { data: any }) => {
      if (data?.type !== "desktop-secret-result" || data.id !== id) return;
      if (typeof data.result === "string") finish(undefined, data.result);
      else finish(new Error("无法使用系统钥匙串保护 AI 设置，请检查钥匙串访问权限"));
    };
    const timer = setTimeout(() => finish(new Error("系统钥匙串响应超时")), 15_000);
    port.on("message", onMessage);
    port.postMessage({ type: "desktop-secret", id, operation, text });
  });
  return { encrypt: text => request("encrypt", text), decrypt: text => request("decrypt", text) };
}
