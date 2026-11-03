import { cp, lstat, readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { desktopValidationCommands } from './workspace.mjs';

// A phone-created workspace has documents and config, but no executable engine.
// Fill only absent public engine resources after the user selected this space.
export async function preparePhoneCreatedWorkspace(root, template) {
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(root, 'mobile-space.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return false; throw new Error('手机空间清单无法读取，原文件已保留。'); }
  if (manifest.version !== 1 || !/^[a-zA-Z0-9_-]{1,100}$/.test(manifest.knowledgeBaseId)) throw new Error('手机空间协议不兼容，请更新客户端。');
  const engine = path.join(root, 'knowledge-engine');
  try { const info = await lstat(engine); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('共享引擎路径不可用，未修改此空间。'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await cp(path.join(template, 'knowledge-engine'), engine, {recursive:true, force:false, errorOnExist:true}); }
  try { await writeFile(path.join(root, 'AGENTS.md'), await readFile(path.join(template, 'AGENTS.md')), {flag:'wx'}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const marker = path.join(root, '.mobile/mac-bootstrap.json');
  let bootstrapped = true;
  try { await access(marker); } catch (error) { if (error.code !== 'ENOENT') throw error; bootstrapped = false; }
  if (!bootstrapped) {
    const filename = path.join(root, 'the-way-here.config.yaml');
    const document = YAML.parseDocument(await readFile(filename, 'utf8'));
    if (document.errors.length) throw new Error('手机空间配置无法读取，原文件已保留。');
    const commands = document.getIn(['validation', 'commands'])?.toJSON?.();
    if (Array.isArray(commands) && !commands.length) {
      document.setIn(['validation', 'commands'], desktopValidationCommands());
      await writeFile(filename + '.mobile-previous', await readFile(filename), {flag:'wx'}).catch(error => { if (error.code !== 'EEXIST') throw error; });
      await writeFile(filename + '.mobile-next', String(document), {flag:'wx'}); await rename(filename + '.mobile-next', filename);
    }
    await mkdir(path.dirname(marker), {recursive:true}); await writeFile(marker, JSON.stringify({version:1}), {flag:'wx'});
  }
  return true;
}

/** Scope a portable worker to the identity in its selected copy, overriding a
 * stale shell KB hint without changing the shell or source workspace. */
export async function portableWorkspaceEnvironment(root) {
  const manifestFile=path.join(root,'mobile-space.json');
  let data;
  try { const info=await lstat(manifestFile); if(info.isSymbolicLink()||!info.isFile())throw new Error('Portable workspace manifest must be a regular file.'); data=await readFile(manifestFile,'utf8'); }
  catch(error){if(error.code==='ENOENT')return {};throw error;}
  const manifest=JSON.parse(data),file=path.join(root,'the-way-here.config.yaml');
  if(!manifest||manifest.version!==1||typeof manifest.knowledgeBaseId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(manifest.knowledgeBaseId)||typeof manifest.wikiPath!=='string'||typeof manifest.sourcesPath!=='string')throw new Error('Portable workspace identity is invalid.');
  const info=await lstat(file);if(info.isSymbolicLink()||!info.isFile())throw new Error('Portable workspace config must be a regular file.');
  const config=YAML.parse(await readFile(file,'utf8')),selected=config?.knowledgeBases?.[manifest.knowledgeBaseId];
  if(config?.defaultKnowledgeBase!==manifest.knowledgeBaseId||!config.knowledgeBases||!Object.hasOwn(config.knowledgeBases,manifest.knowledgeBaseId)||!selected||selected.paths?.wiki!==manifest.wikiPath||selected.paths?.sources!==manifest.sourcesPath)throw new Error('Portable workspace manifest and configuration disagree; the selected copy was not opened.');
  return {THE_WAY_HERE_KNOWLEDGE_BASE:manifest.knowledgeBaseId};
}
const selectionFlag='--twh-selected-workspace';
export function selectedWorkspaceArgument(args) {
  const roots=[];
  for(let i=0;i<args.length;i++) {
    if(args[i]===selectionFlag)roots.push(args[++i]);
    else if(args[i].startsWith(selectionFlag+'='))roots.push(args[i].slice(selectionFlag.length+1));
  }
  if(!roots.length)return undefined;
  if(roots.length!==1||typeof roots[0]!=='string'||!path.isAbsolute(roots[0])||roots[0].includes('\0'))throw new Error('The explicitly selected workspace path is invalid.');
  return path.resolve(roots[0]);
}
export function workspaceRelaunchArguments(args,root) {
  if(typeof root!=='string'||!path.isAbsolute(root)||root.includes('\0'))throw new Error('Workspace relaunch requires an absolute selected root.');
  const kept=[];
  for(let i=0;i<args.length;i++) {
    if(args[i]===selectionFlag){i++;continue;}
    if(!args[i].startsWith(selectionFlag+'='))kept.push(args[i]);
  }
  return [...kept,selectionFlag+'='+root];
}
