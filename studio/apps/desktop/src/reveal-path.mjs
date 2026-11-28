import path from 'node:path';
import os from 'node:os';

function appStateRoot() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'the-way-here');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'the-way-here');
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'the-way-here');
}

/** Roots a renderer may ask the main process to reveal in Finder: the selected
 * workspace, the Electron userData tree and the server app-state root. */
export function allowedRevealRoots(workspace, userData) {
  return [workspace, userData, appStateRoot()].filter((root) => typeof root === 'string' && root).map((root) => path.resolve(root));
}

export function isRevealAllowed(candidate, workspace, userData) {
  if (typeof candidate !== 'string' || !candidate || candidate.includes('\0')) return false;
  let resolved;
  try { resolved = path.resolve(candidate); } catch { return false; }
  return allowedRevealRoots(workspace, userData).some((root) => resolved === root || resolved.startsWith(root + path.sep));
}
