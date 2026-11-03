import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { preparePhoneCreatedWorkspace } from './mobile-workspace.mjs';
import { desktopValidationCommands } from './workspace.mjs';

test('phone bootstrap fills public engine and validation once, preserving later user choices', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'twh-mobile-bootstrap-'));
  try {
    const root = path.join(temp, 'space'), template = path.join(temp, 'template');
    await mkdir(root); await mkdir(path.join(template, 'knowledge-engine'), {recursive:true});
    await writeFile(path.join(template, 'AGENTS.md'), 'Public routing');
    await writeFile(path.join(template, 'knowledge-engine/version'), 'one');
    assert.equal(await preparePhoneCreatedWorkspace(root, template), false);
    await writeFile(path.join(root, 'mobile-space.json'), JSON.stringify({version:1,knowledgeBaseId:'anonymous'}));
    await writeFile(path.join(root, 'the-way-here.config.yaml'), 'version: 3\nvalidation:\n  commands: []\n');
    await preparePhoneCreatedWorkspace(root, template);
    const config = path.join(root, 'the-way-here.config.yaml');
    assert.deepEqual(YAML.parse(await readFile(config, 'utf8')).validation.commands, desktopValidationCommands());
    await writeFile(config, 'version: 3\nvalidation:\n  commands: []\n# deliberate user choice\n');
    await writeFile(path.join(root, 'knowledge-engine/version'), 'custom');
    await preparePhoneCreatedWorkspace(root, template);
    assert.match(await readFile(config, 'utf8'), /deliberate user choice/);
    assert.deepEqual(YAML.parse(await readFile(config, 'utf8')).validation.commands, []);
    assert.equal(await readFile(path.join(root, 'knowledge-engine/version'), 'utf8'), 'custom');
  } finally { await rm(temp, {recursive:true,force:true}); }
});

test('an explicit prepared copy wins stale launch roots and binds only its portable worker identity', async t => {
  const {portableWorkspaceEnvironment,selectedWorkspaceArgument,workspaceRelaunchArguments}=await import('./mobile-workspace.mjs');
  const root=await mkdtemp(path.join(os.tmpdir(),'twh-anonymous-portable-launch-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),copy=path.join(root,'personal-copy'),portable='8c42a04a-d6c8-415a-84eb-c85b929cc71d';await mkdir(source);await mkdir(copy);
  await writeFile(path.join(copy,'mobile-space.json'),JSON.stringify({version:1,knowledgeBaseId:portable,wikiPath:'vault/personal/wiki',sourcesPath:'vault/personal/sources'}));
  const file=path.join(copy,'the-way-here.config.yaml');
  await writeFile(file,YAML.stringify({version:3,defaultKnowledgeBase:portable,knowledgeBases:{[portable]:{paths:{wiki:'vault/personal/wiki',sources:'vault/personal/sources'}}}}));
  const inherited={THE_WAY_HERE_VAULT:source,THE_WAY_HERE_KNOWLEDGE_BASE:'personal'};
  const args=workspaceRelaunchArguments(['desktop-entry.mjs','--diagnostics','--twh-selected-workspace='+source],copy);
  assert.equal(selectedWorkspaceArgument(args),copy);
  const actualRoot=selectedWorkspaceArgument(args)||inherited.THE_WAY_HERE_VAULT;
  const worker={...inherited,...await portableWorkspaceEnvironment(actualRoot),THE_WAY_HERE_VAULT:actualRoot};
  assert.equal(worker.THE_WAY_HERE_VAULT,copy);assert.equal(worker.THE_WAY_HERE_KNOWLEDGE_BASE,portable);
  assert.deepEqual(inherited,{THE_WAY_HERE_VAULT:source,THE_WAY_HERE_KNOWLEDGE_BASE:'personal'});
  assert.deepEqual(await portableWorkspaceEnvironment(source),{});
  assert.deepEqual(args,['desktop-entry.mjs','--diagnostics','--twh-selected-workspace='+copy]);
  assert.throws(()=>selectedWorkspaceArgument(['--twh-selected-workspace=relative']),/invalid/);
  assert.throws(()=>selectedWorkspaceArgument(['--twh-selected-workspace='+source,'--twh-selected-workspace='+copy]),/invalid/);
  await writeFile(file,YAML.stringify({version:3,defaultKnowledgeBase:'personal',knowledgeBases:{personal:{paths:{wiki:'vault/personal/wiki',sources:'vault/personal/sources'}}}}));
  await assert.rejects(portableWorkspaceEnvironment(copy),/disagree/);
});
