import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.dirname(studio);
const output=path.join(studio,'.runtime/app-store-handoff');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
const source=path.join(output,'The-Way-Here');await mkdir(source);
const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--','studio','knowledge-engine','vault/demo','AGENTS.md','.gitignore'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of new Set(files)) {
  if(file.split('/').some(part=>['node_modules','.runtime','dist','.git','.impeccable','__pycache__'].includes(part)) || /(^|\/)\.env($|\.)|\.pyc$|\.DS_Store$/.test(file)) continue;
  const input=path.join(root,file),target=path.join(source,file);
  const info=await lstat(input);if(!info.isFile()) throw new Error(`交接只接受普通源码文件：${file}`);
  await mkdir(path.dirname(target),{recursive:true});await cp(input,target);
}
const config=YAML.parse(await readFile(path.join(root,'the-way-here.config.yaml'),'utf8'));
config.defaultKnowledgeBase='demo';config.knowledgeBases={demo:config.knowledgeBases.demo};
await writeFile(path.join(source,'the-way-here.config.yaml'),YAML.stringify(config));
await cp(path.join(studio,'.runtime/app-store-preparation'),path.join(output,'preparation-assets'),{recursive:true});
await writeFile(path.join(output,'READ-FIRST.txt'),'This is source and anonymous preparation material, NOT a signed App Store package.\nRead The-Way-Here/studio/docs/app-store/friend-publish-prompt.md and mas-validation.md.\nNo personal vault, certificates, credentials or local runtime is included.\n');
const zip=path.join(studio,'.runtime/The-Way-Here-MAS-Handoff.zip');await rm(zip,{force:true});
execFileSync('/usr/bin/zip',['-q','-r',zip,'.'],{cwd:output});
console.log(zip);
