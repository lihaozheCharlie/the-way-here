import path from 'node:path';

/** The general-purpose search runtime has no shared-Keychain helper identity. */
export function bundledNodeEnvironment({ packaged, resources }) {
  if (!packaged) return {};
  if (!path.isAbsolute(resources)) throw new Error('Packaged Node requires an absolute application Resources path.');
  return { TWH_BUNDLED_NODE: path.join(resources, 'node', 'bin', 'node') };
}
