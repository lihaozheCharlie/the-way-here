const fs = require('node:fs/promises');
const path = require('node:path');
// electron-builder deliberately filters node_modules from extraResources.
// Copy our already materialized, production-only graph before code signing.
module.exports = async function afterPack(context) {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  await fs.cp(path.join(context.packager.projectDir, '.runtime/package/server/node_modules'), path.join(resources, 'server/node_modules'), { recursive:true });
};
