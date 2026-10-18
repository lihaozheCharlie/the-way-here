import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Import only the login material explicitly selected by the user. Never load
// their existing plugins, MCP servers, hooks, threads or project configuration.
export async function prepareMasCodexHome(userData, loginDirectory) {
  const home = path.join(userData, 'codex-mas');
  const cwd = path.join(home, 'working');
  await mkdir(cwd, {recursive:true, mode:0o700});
  await chmod(home, 0o700); await chmod(cwd, 0o700);
  if (loginDirectory) {
    const raw = await readFile(path.join(loginDirectory, 'auth.json'), 'utf8');
    if (Buffer.byteLength(raw) > 1_000_000) throw new Error('Codex 登录文件过大');
    let auth;
    try { auth = JSON.parse(raw); } catch { throw new Error('Codex 登录文件格式无效，请重新登录后再连接。'); }
    if (!auth || typeof auth !== 'object' || !auth.tokens?.access_token) throw new Error('请选择保存 ChatGPT 登录的 Codex 配置目录（auth.json）。不会导入 API 密钥或其他配置。');
    const file = path.join(home, 'auth.json');
    await writeFile(file + '.tmp', JSON.stringify({auth_mode:'chatgpt',tokens:auth.tokens,...(auth.last_refresh ? {last_refresh:auth.last_refresh} : {})}), {mode:0o600});
    await chmod(file + '.tmp', 0o600); await rename(file + '.tmp', file);
  }
  await writeFile(path.join(home, 'config.toml'), 'model_provider = "openai"\ncli_auth_credentials_store = "file"\n', {mode:0o600});
  return { home, cwd };
}
