import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { MOBILE_KEYCHAIN_BUNDLE_NAME, packagedMobileKeychainBundle, mobileKeychainExecutable } from './mobile-keychain-layout.mjs';
const developmentDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const inArchive=fileURLToPath(import.meta.url).split(path.sep).includes('app.asar');
export function resolveMobileKeychainBinary({resourcesPath=process.resourcesPath,developmentRoot=developmentDirectory,pathExists=existsSync,packaged=inArchive}={}) {
  if(typeof resourcesPath==='string'&&path.isAbsolute(resourcesPath)) {
    const bundle=packagedMobileKeychainBundle(resourcesPath);
    // A present but broken profile-enabled bundle must fail closed rather than
    // selecting a bare helper with a different signing/capability identity.
    if(pathExists(bundle))return mobileKeychainExecutable(bundle);
    const bare=path.join(resourcesPath,'native/mobile-keychain');
    if(packaged||pathExists(bare))return bare;
  }
  if(packaged)return undefined;
  const bundle=path.join(developmentRoot,MOBILE_KEYCHAIN_BUNDLE_NAME);
  return pathExists(bundle)?mobileKeychainExecutable(bundle):path.join(developmentRoot,'mobile-keychain');
}
export function createMobileKeychain({ binary = resolveMobileKeychainBinary(), spawnProcess = spawn } = {}) {
  return async function request(operation, provider, token) {
    if (!['status','read','write','remove'].includes(operation) || operation !== 'status' && !['deepseek','zhipu','qwen','kimi','openai'].includes(provider)) throw new Error('共享钥匙串请求无效');
    if (operation !== 'write' && token !== undefined || operation === 'write' && (typeof token !== 'string' || !token || Buffer.byteLength(token) > 8192)) throw new Error('共享钥匙串请求无效');
    if(typeof binary!=='string'||!path.isAbsolute(binary))throw new Error('此安装包没有可用的共享钥匙串组件');
    return await new Promise((resolve, reject) => {
      const child = spawnProcess(binary, [], { stdio: ['pipe','pipe','ignore'], windowsHide: true });
      let bytes = Buffer.alloc(0), settled = false;
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) { try { child.kill(); } catch {} reject(error); } else resolve(value); };
      const timer = setTimeout(() => { child.kill(); finish(new Error('共享钥匙串响应超时，原本机密钥保留')); }, 12000);
      child.on('error', () => finish(new Error('此安装包没有可用的共享钥匙串组件')));
      child.stdout.on('data', data => { bytes = Buffer.concat([bytes,data]); if (bytes.length > 20000) { child.kill(); finish(new Error('共享钥匙串响应无效')); } });
      child.on('close', code => { if (settled) return; try { const value = JSON.parse(bytes.toString('utf8')); if (code !== 0 || typeof value.available !== 'boolean') throw new Error(); finish(undefined,value); } catch { finish(new Error('共享钥匙串操作失败，原本机密钥保留')); } });
      child.stdin.on('error', () => finish(new Error('共享钥匙串私有通道不可用')));
      child.stdin.end(JSON.stringify({ operation, provider, token }));
    });
  };
}
