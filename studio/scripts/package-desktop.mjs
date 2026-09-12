import { packageKnowledge } from './package-knowledge.mjs';
import { packageServer } from "./package-server.mjs";
import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(command,args) { const result=spawnSync(command,args,{cwd:studio,stdio:'inherit',env:process.env}); if(result.status!==0) process.exit(result.status || 1); }
const destination=path.join(studio,'.runtime/package/server');
await rm(destination,{recursive:true,force:true});
await mkdir(path.join(studio,'apps/desktop/dist'),{recursive:true});
run(process.execPath,['scripts/build-desktop-native.mjs']);
await packageServer(studio,destination);
await packageKnowledge(studio);
run(process.execPath,['node_modules/electron-builder/out/cli/cli.js','--config','electron-builder.yml','--mac','dir','--publish','never']);
