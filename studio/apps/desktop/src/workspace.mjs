import YAML from 'yaml';
import path from 'node:path';
import { access, cp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';

const configName = 'the-way-here.config.yaml';
const initialConfig = `version: 3
name: The Way Here
adapter: personal-growth
defaultKnowledgeBase: personal
paths:
  skills: knowledge-engine/skills
  tools: knowledge-engine/tools
  agentInstructions: AGENTS.md
knowledgeBases:
  personal:
    name: 我的知识库
    paths:
      wiki: app/personal/wiki
      sources: app/personal/sources
agents:
  defaultRuntime: auto
  runtimes:
    codex:
      enabled: true
      command: codex
      transport: stdio
    pi:
      enabled: true
      providers: []
validation:
  commands:
    - [python3, knowledge-engine/tools/update_obsidian_tags.py]
    - [python3, knowledge-engine/tools/update_obsidian_tags.py]
    - [python3, knowledge-engine/tools/validate_wiki_links.py]
    - [python3, knowledge-engine/tools/validate_skill_system.py]
`;


async function ensureWebDemo(root, resources) {
  const target = path.join(root, configName);
  const document = YAML.parseDocument(await readFile(target, 'utf8'));
  if (document.errors.length || !YAML.isMap(document.contents) || !YAML.isMap(document.get('knowledgeBases'))) throw new Error('知识空间配置无法读取，请保留原文件并恢复之前的配置。');
  if (document.hasIn(['knowledgeBases', 'demo'])) return;
  // Retain original paths: photo and bill sidecars contain vault/demo references.
  await cp(path.join(resources, 'demo'), path.join(root, 'vault/demo'), { recursive:true, force:false });
  document.setIn(['knowledgeBases', 'demo'], {
    name: 'The Way Here 演示 Wiki',
    description: '原 Web 端的匿名演示知识库',
    paths: { wiki:'vault/demo/wiki', sources:'vault/demo/sources' },
    validation: { commands:[] },
  });
  await writeFile(target + '.tmp', String(document), {mode:0o600});
  await rename(target + '.tmp', target);
}

export async function saveWorkspace(userData, root) {
  await mkdir(userData, { recursive: true });
  const target = path.join(userData, 'workspace.json');
  await writeFile(target + '.tmp', JSON.stringify({ root }), { mode: 0o600 });
  await rename(target + '.tmp', target);
}

// Only application-managed resources are refreshed. Never replace user configuration or records.
export async function prepareWorkspace({ userData, resources }) {
  const managedRoot = path.join(userData, 'workspace');
  let root = managedRoot;
  let savedLocation = false;
  try {
    const saved = JSON.parse(await readFile(path.join(userData, 'workspace.json'), 'utf8'));
    if (typeof saved.root !== 'string' || !path.isAbsolute(saved.root)) throw new Error('保存的位置无效');
    root = saved.root;
    savedLocation = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('无法读取上次使用的知识空间。请保留现有数据，通过“打开已有知识空间”重新选择位置。', { cause: error });
  }
  if (savedLocation) {
    try { await access(path.join(root, configName)); }
    catch { throw new Error('上次使用的知识空间暂时无法访问。请检查外接磁盘是否已连接，或重新选择原来的位置。'); }
    if (root !== managedRoot) return root;
  }
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, 'app/personal/wiki'), { recursive: true });
  await mkdir(path.join(root, 'app/personal/sources'), { recursive: true });
  // Stage before replacement so interrupted copies cannot leave a partially updated engine.
  const staged = path.join(root, '.knowledge-engine-next');
  await rm(staged, { recursive: true, force: true });
  await cp(path.join(resources, 'knowledge-engine'), staged, { recursive: true });
  const engine = path.join(root, 'knowledge-engine');
  const previous = path.join(root, '.knowledge-engine-previous');
  await rm(previous, { recursive: true, force: true });
  try { await rename(engine, previous); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rename(staged, engine);
  await rm(previous, { recursive: true, force: true });
  await cp(path.join(resources, 'AGENTS.md'), path.join(root, 'AGENTS.md'), { force: false });
  try { await writeFile(path.join(root, configName), initialConfig, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await ensureWebDemo(root, resources);
  await saveWorkspace(userData, root);
  return root;
}
