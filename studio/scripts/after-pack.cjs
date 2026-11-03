const fs = require('node:fs/promises');
const path = require('node:path');
// electron-builder deliberately filters node_modules from extraResources.
// Copy our already materialized, production-only graph before code signing.
module.exports = async function afterPack(context, {mobileKeychain,nodeRuntime}={}) {
  const resources = ['darwin', 'mas'].includes(context.electronPlatformName)
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  await fs.cp(path.join(context.packager.projectDir, '.runtime/package/server/node_modules'), path.join(resources, 'server/node_modules'), { recursive:true, verbatimSymlinks:true });
  const {preparePackagedNode}=await import('./node-runtime.mjs');
  await (nodeRuntime ?? preparePackagedNode)(context);
  const {preparePackagedMobileKeychain}=await import('./mobile-keychain-bundle.mjs');
  await preparePackagedMobileKeychain(context,mobileKeychain);
  if (context.packager.config?.mas?.type) require('./mas-bundle-metadata.cjs')(path.dirname(path.dirname(resources)));
};
