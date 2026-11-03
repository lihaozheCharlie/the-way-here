// Run with: node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/verify-portable-workspace.mjs
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import YAML from 'yaml';
import {prepareMobileWorkspace} from '../apps/server/src/modules/mobile-sync/prepare-workspace.ts';
import {KnowledgeRuntime} from '../apps/server/src/runtime/knowledge-runtime.ts';
import {CapturePreferencesStore} from '../apps/server/src/modules/content/capture-preferences-store.ts';
import {CaptureHistoryStore} from '../apps/server/src/modules/content/capture-history-store.ts';
import {UserPreferences} from '../apps/desktop/src/user-preferences.mjs';
import {portableWorkspaceEnvironment,selectedWorkspaceArgument,workspaceRelaunchArguments} from '../apps/desktop/src/mobile-workspace.mjs';
const base=await mkdtemp(path.join(await realpath(os.tmpdir()),'twh-anonymous-portable-smoke-'));
try {
  process.env.VITEST='1';process.env.TWH_TEST_STATE_ROOT=path.join(base,'isolated-app-state');
  const root=path.join(base,'original'),destination=path.join(base,'Spaces');await mkdir(destination);
  const paths={wiki:'vault/personal/wiki',sources:'vault/personal/sources',skills:'skills',tools:'tools',agentInstructions:'AGENTS.md'};
  for(const relative of [paths.wiki,paths.sources,paths.skills,paths.tools,'vault/personal/predictions'])await mkdir(path.join(root,relative),{recursive:true});
  const original='Fictional original: personal is authored text, not an identity field.';
  await writeFile(path.join(root,paths.sources,'original.md'),original);
  await writeFile(path.join(root,'AGENTS.md'),'Anonymous public fixture.');
  const originalConfig=YAML.stringify({version:3,defaultKnowledgeBase:'personal',knowledgeBases:{personal:{name:'Anonymous copied space',paths:{wiki:paths.wiki,sources:paths.sources}}}});
  await writeFile(path.join(root,'the-way-here.config.yaml'),originalConfig);
  await writeFile(path.join(root,'vault/personal/predictions/state.json'),JSON.stringify({knowledgeBaseId:'personal',status:'idle',thoughts:'personal remains authored input'}));
  const config={knowledgeBaseId:'personal',name:'Anonymous copied space',adapter:'personal-growth',paths,validation:{commands:[]}};
  await new CapturePreferencesStore(root).set('personal','Chosen original capture folder');
  const copy=await prepareMobileWorkspace(root,config,destination),manifest=JSON.parse(await readFile(path.join(copy,'mobile-space.json'),'utf8'));
  const preferences=new UserPreferences(path.join(base,'anonymous-native-settings'));
  preferences.set(root,'capture.default-folder.personal','Chosen personal folder');
  preferences.copyWorkspacePreferences(root,copy,{knowledgeBaseIdMap:{personal:manifest.knowledgeBaseId}});
  const inherited={THE_WAY_HERE_VAULT:root,THE_WAY_HERE_KNOWLEDGE_BASE:'personal'};
  const args=workspaceRelaunchArguments(['anonymous-desktop-entry.mjs'],copy);
  const selected=selectedWorkspaceArgument(args)||inherited.THE_WAY_HERE_VAULT;
  const workerEnv={...inherited,...await portableWorkspaceEnvironment(selected),THE_WAY_HERE_VAULT:selected};
  assert.equal(workerEnv.THE_WAY_HERE_VAULT,copy);assert.equal(workerEnv.THE_WAY_HERE_KNOWLEDGE_BASE,manifest.knowledgeBaseId);
  const knowledge=await KnowledgeRuntime.create(workerEnv.THE_WAY_HERE_VAULT,workerEnv.THE_WAY_HERE_KNOWLEDGE_BASE);
  try {
    const opened=(await knowledge.resolve()).config.knowledgeBaseId;
    assert.equal(opened,manifest.knowledgeBaseId);assert.equal((await new CaptureHistoryStore(copy).list(opened)).defaultFolder,'Chosen original capture folder');await assert.rejects(knowledge.resolve('personal'));
    assert.equal(new UserPreferences(path.join(base,'anonymous-native-settings')).get(copy,'capture.default-folder.'+opened),'Chosen personal folder');
  } finally {await knowledge.close();}
  assert.equal(await readFile(path.join(root,'the-way-here.config.yaml'),'utf8'),originalConfig);
  assert.equal(await readFile(path.join(root,paths.sources,'original.md'),'utf8'),original);
  assert.equal(await readFile(path.join(copy,paths.sources,'original.md'),'utf8'),original);
  assert.deepEqual(inherited,{THE_WAY_HERE_VAULT:root,THE_WAY_HERE_KNOWLEDGE_BASE:'personal'});
  console.log(JSON.stringify({passed:true,independentPortableIdentity:true,openedCopyWithStaleInheritedHints:true,originalIdentityRejectedInCopy:true,actualNewLibraryFolderPreferencePreserved:true,originalBytesPreserved:true}));
} finally {await rm(base,{recursive:true,force:true});}
