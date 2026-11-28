// Command-line plumbing for relaunching the app with an explicitly selected
// workspace root (menu "打开已有知识空间…" and workspace switching).
import path from 'node:path';

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
